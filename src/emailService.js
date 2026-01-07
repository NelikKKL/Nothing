// Сервис для работы с почтой как транспортом сообщений
class EmailService {
  constructor() {
    this.accessToken = localStorage.getItem('ns_gmail_token') || null;
    if (!localStorage.getItem('email_transport_db')) {
      localStorage.setItem('email_transport_db', JSON.stringify([]));
    }
  }

  setAccessToken(token) {
    this.accessToken = token;
    localStorage.setItem('ns_gmail_token', token);
  }

  // Отправка сообщения
  async sendAsEmail({ to, from, subject, encryptedBody, metadata }) {
    console.log(`%c[TRANSPORT] Sending to ${to}...`, 'color: #ff0000; font-weight: bold;');
    
    const emailEnvelope = {
      id: `msg_${Date.now()}`,
      from,
      to,
      subject: subject || "NS_SECURE_MSG",
      body: encryptedBody,
      metadata,
      sentAt: new Date().toISOString(),
    };

    // 1. Сохраняем локально для истории
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    db.push(emailEnvelope);
    localStorage.setItem('email_transport_db', JSON.stringify(db));

    // 2. Реальная отправка через Gmail API (если есть токен) или mailto
    if (this.accessToken) {
      try {
        const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(emailEnvelope.subject)))}?=`;
        const emailContent = [
          `To: ${to}`,
          `Subject: ${utf8Subject}`,
          'Content-Type: text/plain; charset="utf-8"',
          '',
          "--- NS MESSENGER ENCRYPTED MESSAGE ---",
          "",
          encryptedBody,
          "",
          "--------------------------------------",
          `Session ID: ${metadata.sessionId}`
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
        
        console.log("Sent via Gmail API");
      } catch (e) {
        console.error("Gmail API Send failed, falling back to mailto:", e);
        this.openMailto(to, emailEnvelope.subject, encryptedBody, metadata);
      }
    } else {
      this.openMailto(to, emailEnvelope.subject, encryptedBody, metadata);
    }

    return emailEnvelope;
  }

  openMailto(to, subject, body, metadata) {
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      "--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n" + 
      body + 
      "\n\n--------------------------------------\n" +
      "Скопируйте текст выше и вставьте в NS Messenger для расшифровки.\n" +
      "Session ID: " + metadata.sessionId
    )}`;
    window.location.href = mailtoUrl;
  }

  // Получение новых сообщений (реальный Gmail + локальный кэш)
  async fetchInbox(myEmail) {
    let messages = JSON.parse(localStorage.getItem('email_transport_db')).filter(mail => mail.to === myEmail);

    if (this.accessToken) {
      try {
        // Ищем письма с темой NS_MSG или содержащие наш маркер
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=NS_SECURE_MSG OR "NS MESSENGER ENCRYPTED MESSAGE"', {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
        const data = await response.json();

        if (data.messages) {
          for (const msgInfo of data.messages.slice(0, 10)) { // Берем последние 10
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgInfo.id}`, {
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const detail = await detailRes.json();
            
            const fromHeader = detail.payload.headers.find(h => h.name === 'From')?.value || '';
            const subject = detail.payload.headers.find(h => h.name === 'Subject')?.value || '';
            const fromEmail = fromHeader.match(/<(.+)>/)?.[1] || fromHeader;
            
            // Извлекаем тело письма (может быть в разных частях)
            let body = "";
            if (detail.payload.parts) {
              body = atob(detail.payload.parts[0].body.data.replace(/-/g, '+').replace(/_/g, '/'));
            } else {
              body = atob(detail.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            }

            const match = body.match(/--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n([\s\S]+?)\n\n---/);
            const encryptedBody = match ? match[1].trim() : null;

            if (encryptedBody) {
              messages.push({
                id: detail.id,
                from: fromEmail,
                to: myEmail,
                subject: subject,
                body: encryptedBody,
                sentAt: new Date(parseInt(detail.internalDate)).toISOString()
              });
            }
          }
        }
      } catch (e) {
        console.error("Gmail Fetch Error:", e);
      }
    }
    
    return messages;
  }
}

export const emailService = new EmailService();
