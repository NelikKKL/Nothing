// Сервис для работы с почтой как транспортом сообщений
class EmailService {
  constructor() {
    // Инициализируем хранилище сообщений в localStorage для симуляции реального сервера
    if (!localStorage.getItem('email_transport_db')) {
      localStorage.setItem('email_transport_db', JSON.stringify([]));
    }
  }

  // Отправка сообщения (имитация SMTP)
  async sendAsEmail({ to, from, subject, encryptedBody, metadata }) {
    console.log(`%c[SMTP] Sending to ${to}...`, 'color: #ff0000; font-weight: bold;');
    
    const emailEnvelope = {
      id: `mail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      subject: subject || "NS_SECURE_MSG",
      body: encryptedBody,
      headers: {
        "X-Mailer": "NS-Messenger-Secure",
        "X-Session-ID": metadata.sessionId,
        "Content-Type": "application/x-ns-encrypted"
      },
      sentAt: new Date().toISOString(),
      status: 'delivered'
    };

    // Сохраняем "на сервере" (в localStorage)
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    db.push(emailEnvelope);
    localStorage.setItem('email_transport_db', JSON.stringify(db));

    // Имитируем задержку сети
    await new Promise(resolve => setTimeout(resolve, 1500));
    return emailEnvelope;
  }

  // Получение новых сообщений (имитация IMAP/POP3)
  async fetchInbox(myEmail) {
    console.log(`%c[IMAP] Checking inbox for ${myEmail}...`, 'color: #00ff00;');
    
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    // Фильтруем письма, адресованные нам
    const myEmails = db.filter(mail => mail.to === myEmail);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    return myEmails;
  }
}

export const emailService = new EmailService();
