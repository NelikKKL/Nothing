import CryptoJS from 'crypto-js';

// Функция для генерации случайного ключа сессии
export const generateSessionKey = () => {
  return CryptoJS.lib.WordArray.random(256 / 8).toString();
};

// Шифрование сообщения
export const encryptMessage = (message, key) => {
  return CryptoJS.AES.encrypt(message, key).toString();
};

// Расшифровка сообщения
export const decryptMessage = (ciphertext, key) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error("Decryption failed", e);
    return null;
  }
};
