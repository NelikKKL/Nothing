// Сервис для работы с почтой как транспортом сообщений
class EmailService {
  constructor() {
    this.accessToken = localStorage.getItem('ns_gmail_token') || null;
    this.lastSync = localStorage.getItem('ns_last_sync') || 0;
    if (!localStorage.getItem('email_transport_db')) {
      localStorage.setItem('email_transport_db', JSON.stringify([]));
    }
  }

  setAccessToken(token) {
    this.accessToken = token;
    localStorage.setItem('ns_gmail_token', token);
  }

  // Универсальный метод отправки (Delta Chat Style)
  async sendAsEmail({ to, from, subject, encryptedBody, metadata }) {
    // Генерируем Message-ID для трединга (как в Delta Chat)
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(7)}@ns.messenger>`;
    
    const emailEnvelope = {
      id: messageId,
      from,
      to,
      subject: subject || "NS_SECURE_MSG",
      body: encryptedBody,
      metadata,
      sentAt: new Date().toISOString(),
    };

    // Сохраняем локально
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    if (!db.find(m => m.id === messageId)) {
      db.push(emailEnvelope);
      localStorage.setItem('email_transport_db', JSON.stringify(db));
    }

    if (this.accessToken && this.accessToken !== 'null') {
      try {
        const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(emailEnvelope.subject)))}?=`;
        const emailContent = [
          `Message-ID: ${messageId}`,
          `To: ${to}`,
          `Subject: ${utf8Subject}`,
          'Content-Type: text/plain; charset="utf-8"',
          'X-Mailer: NS-Messenger-v1',
          'Chat-Version: 1.0',
          '',
          "--- NS MESSENGER ENCRYPTED MESSAGE ---",
          "",
          encryptedBody,
          "",
          "--------------------------------------",
          `Session ID: ${metadata.sessionId}`,
          "Reply to this email using NS Messenger."
        ].join('\r\n');

        const base64Safe = btoa(unescape(encodeURIComponent(emailContent)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: base64Safe })
        });
        
        return { success: true, id: messageId };
      } catch (e) {
        console.error("Gmail API failed, using fallback");
        return this.openMailto(to, emailEnvelope.subject, encryptedBody, metadata);
      }
    } else {
      return this.openMailto(to, emailEnvelope.subject, encryptedBody, metadata);
    }
  }

  openMailto(to, subject, body, metadata) {
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      "--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n" + 
      body + 
      "\n\n--------------------------------------\n" +
      "Session ID: " + metadata.sessionId
    )}`;
    window.location.href = mailtoUrl;
    return { success: true, fallback: true };
  }

  // Умное получение входящих (Delta Chat Style)
  // Автоматический разбор сообщения из буфера или ручного ввода
  processManualMessage(fullText) {
    try {
      const msgMatch = fullText.match(/---NS_SECURE_MSG_BEGIN---\n([\s\S]*?)\n---NS_SECURE_MSG_END---/);
      const senderMatch = fullText.match(/From: (.*)/);
      
      if (!msgMatch) return false;

      const encryptedContent = msgMatch[1].trim();
      let senderEmail = senderMatch ? senderMatch[1].trim() : 'Unknown';
      
      // Если отправитель не найден в тексте, попробуем найти его по контексту (если мы в чате)
      // Но здесь у нас нет доступа к контексту чата напрямую, поэтому оставим Unknown
      // или попробуем вытащить из первой строки если там есть email
      if (senderEmail === 'Unknown') {
        const emailInText = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailInText) senderEmail = emailInText[0];
      }
      
      // Создаем объект сообщения
      const newMsg = {
        id: 'manual_' + Date.now(),
        from: senderEmail,
        subject: 'Secure Message',
        body: encryptedContent,
        date: new Date().toISOString(),
        isManual: true
      };

      // Сохраняем в локальную базу транспорта
      let localDb = JSON.parse(localStorage.getItem('email_transport_db') || '[]');
      
      // Проверка на дубликаты по телу сообщения
      if (localDb.some(m => m.body === encryptedContent)) return false;

      localDb.push(newMsg);
      localStorage.setItem('email_transport_db', JSON.stringify(localDb));
      return true;
    } catch (e) {
      console.error("Error processing manual message:", e);
      return false;
    }
  }

  async fetchInbox(myEmail) {
    let localDb = JSON.parse(localStorage.getItem('email_transport_db'));
    let newMsgs = [];

    if (this.accessToken && this.accessToken !== 'null') {
      try {
        // Ищем только новые сообщения с момента последней синхронизации
        const query = `(NS_SECURE_MSG OR "NS MESSENGER ENCRYPTED MESSAGE")`;
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`, {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        const data = await response.json();

        if (data.messages) {
          for (const msgInfo of data.messages) {
            // Проверяем, нет ли у нас уже этого сообщения
            if (localDb.find(m => m.id === msgInfo.id)) continue;

            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgInfo.id}`, {
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const detail = await detailRes.json();
            
            const fromHeader = detail.payload.headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
            const subject = detail.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
            const fromEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;
            
            let body = "";
            if (detail.payload.parts) {
              const part = detail.payload.parts.find(p => p.mimeType === 'text/plain') || detail.payload.parts[0];
              body = this.decodeBase64(part.body.data);
            } else if (detail.payload.body.data) {
              body = this.decodeBase64(detail.payload.body.data);
            }

            const match = body.match(/--- NS MESSENGER ENCRYPTED MESSAGE ---\s+([\s\S]+?)\s+---/);
            const encryptedBody = match ? match[1].trim() : (body.includes("NS_KEY_SHARE:") ? body.trim() : null);

            if (encryptedBody) {
              const newMsg = {
                id: msgInfo.id,
                from: fromEmail,
                to: myEmail,
                subject: subject,
                body: encryptedBody,
                isKeyShare: encryptedBody.startsWith("NS_KEY_SHARE:"),
                sentAt: new Date(parseInt(detail.internalDate)).toISOString()
              };
              newMsgs.push(newMsg);
              localDb.push(newMsg);
            }
          }
          localStorage.setItem('email_transport_db', JSON.stringify(localDb));
          localStorage.setItem('ns_last_sync', Date.now().toString());
        }
      } catch (e) {
        console.error("Sync Error:", e);
      }
    }
    
    return localDb.filter(mail => mail.to === myEmail);
  }

  decodeBase64(data) {
    try {
      return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
      return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    }
  }
}

export const emailService = new EmailService();
