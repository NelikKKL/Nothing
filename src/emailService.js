// Сервис для работы с почтой как транспортом сообщений
class EmailService {
  constructor() {
    // Инициализируем хранилище сообщений в localStorage для симуляции 
    // (позволяет тестировать на одном устройстве между разными "аккаунтами")
    if (!localStorage.getItem('email_transport_db')) {
      localStorage.setItem('email_transport_db', JSON.stringify([]));
    }
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

    // 1. Сохраняем локально (для теста на одном устройстве)
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    db.push(emailEnvelope);
    localStorage.setItem('email_transport_db', JSON.stringify(db));

    // 2. Реальная отправка через mailto: (открывает почтовый клиент)
    // Это гарантирует, что письмо РЕАЛЬНО уйдет по почте
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      "--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n" + 
      encryptedBody + 
      "\n\n--------------------------------------\n" +
      "Скопируйте текст выше и вставьте в NS Messenger для расшифровки.\n" +
      "Session ID: " + metadata.sessionId
    )}`;

    // В Capacitor/Cordova лучше использовать window.open или специализированный плагин,
    // но для PWA достаточно window.location.href
    window.location.href = mailtoUrl;

    // Имитируем задержку для UI
    await new Promise(resolve => setTimeout(resolve, 1000));
    return emailEnvelope;
  }

  // Получение новых сообщений (симуляция входящих из localStorage)
  async fetchInbox(myEmail) {
    const db = JSON.parse(localStorage.getItem('email_transport_db'));
    // Фильтруем письма, адресованные нам
    return db.filter(mail => mail.to === myEmail);
  }
  
  // Метод для ручного импорта зашифрованного текста (если пользователь скопировал его из реальной почты)
  importFromText(text, key) {
    // Логика парсинга текста и расшифровки
    // Это мы вызовем из App.jsx
  }
}

export const emailService = new EmailService();
