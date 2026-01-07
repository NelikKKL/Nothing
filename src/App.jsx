import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, MessageSquare, Settings, Shield, User, Mail, Plus, Loader2, CheckCheck, RefreshCw, ArrowRight } from 'lucide-react';
import { generateSessionKey, encryptMessage, decryptMessage } from './crypto';
import { emailService } from './emailService';

function App() {
  const [user, setUser] = useState(null);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionKey, setSessionKey] = useState(null);
  const [isTransporting, setIsTransporting] = useState(false);
  const [transportStatus, setTransportStatus] = useState('');
  
  const [chats] = useState([
    { id: 1, name: 'Alice', email: 'alice@example.com', lastMessage: 'Hey there!', timestamp: '10:30' },
    { id: 2, name: 'Bob', email: 'bob@example.com', lastMessage: 'Did you see the key?', timestamp: '09:15' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com', lastMessage: 'Encrypted message', timestamp: 'Yesterday' },
  ]);

  const scrollRef = useRef(null);

  // Проверка регистрации при загрузке
  useEffect(() => {
    const savedUser = localStorage.getItem('ns_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Генерируем новый ключ при заходе в чат
  useEffect(() => {
    if (activeChat) {
      const newKey = generateSessionKey();
      setSessionKey(newKey);
      setMessages([
        { id: 0, text: `--- НОВЫЙ КЛЮЧ СЕССИИ СГЕНЕРИРОВАН ---`, isSystem: true },
        { id: 1, text: 'Канал связи через почту готов. Все сообщения шифруются AES-256.', sender: 'system', timestamp: 'now' }
      ]);
      checkInbox();
    }
  }, [activeChat]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleRegister = (e) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) return;
    
    const newUser = { name: regName, email: regEmail };
    localStorage.setItem('ns_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const checkInbox = async () => {
    if (!activeChat || !user) return;
    setIsTransporting(true);
    setTransportStatus('IMAP: Проверка входящих писем...');
    
    try {
      const inbox = await emailService.fetchInbox(user.email);
      const chatEmails = inbox.filter(mail => mail.from === activeChat.email);
      if (chatEmails.length > 0) {
        console.log("Found emails from chat partner:", chatEmails);
      }
    } finally {
      setTimeout(() => {
        setIsTransporting(false);
        setTransportStatus('');
      }, 500);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !sessionKey || !user) return;

    const textToSend = newMessage;
    setNewMessage('');
    
    const encrypted = encryptMessage(textToSend, sessionKey);
    
    const tempId = Date.now();
    const msgObj = {
      id: tempId,
      text: textToSend,
      encrypted: encrypted,
      sender: 'me',
      status: 'sending',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, msgObj]);

    setIsTransporting(true);
    setTransportStatus('SMTP: Упаковка в письмо и отправка...');
    
    try {
      await emailService.sendAsEmail({
        to: activeChat.email,
        from: user.email,
        subject: `ENC_MSG_${tempId}`,
        encryptedBody: encrypted,
        metadata: { sessionId: sessionKey.substring(0, 8) }
      });
      
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));
    } catch (err) {
      setTransportStatus('Ошибка SMTP транспорта!');
    } finally {
      setTimeout(() => {
        setIsTransporting(false);
        setTransportStatus('');
      }, 1000);
    }
  };

  // Экран регистрации
  if (!user) {
    return (
      <div className="flex h-screen bg-dark-900 items-center justify-center" style={{ backgroundColor: '#121212', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', padding: '40px', backgroundColor: '#1e1e1e', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'inline-flex', padding: '15px', backgroundColor: '#2d2d2d', borderRadius: '50%', color: '#ff0000', marginBottom: '20px' }}>
              <Shield size={40} />
            </div>
            <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 'bold' }}>NS Messenger</h1>
            <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Создайте защищенный профиль</p>
          </div>

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '12px', color: '#666', marginBottom: '5px', display: 'block', textTransform: 'uppercase' }}>Ваше имя</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Иван Иванов" 
                  required
                  style={{ width: '100%', backgroundColor: '#2d2d2d', border: '1px solid #333', borderRadius: '10px', padding: '12px 12px 12px 40px', color: 'white', outline: 'none' }}
                />
                <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#ff0000' }} />
              </div>
            </div>

            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '12px', color: '#666', marginBottom: '5px', display: 'block', textTransform: 'uppercase' }}>Электронная почта</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="email" 
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@mail.com" 
                  required
                  style={{ width: '100%', backgroundColor: '#2d2d2d', border: '1px solid #333', borderRadius: '10px', padding: '12px 12px 12px 40px', color: 'white', outline: 'none' }}
                />
                <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#ff0000' }} />
              </div>
            </div>

            <button 
              type="submit"
              style={{ 
                marginTop: '10px',
                backgroundColor: '#ff0000', 
                color: 'white', 
                border: 'none', 
                borderRadius: '10px', 
                padding: '14px', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s'
              }}
            >
              Продолжить <ArrowRight size={18} />
            </button>
          </form>

          <p style={{ marginTop: '25px', fontSize: '11px', color: '#555' }}>
            Ваши данные сохраняются локально и используются для идентификации в почтовом канале.
          </p>
        </div>
      </div>
    );
  }

  // Основной интерфейс (показывается только если user != null)
  return (
    <div className="flex h-screen bg-dark-900" style={{ color: 'white', fontFamily: 'sans-serif' }}>
      {/* Sidebar */}
      <div className="w-80 bg-dark-800 border-r flex flex-col" style={{ width: '320px', borderRight: '1px solid #2d2d2d' }}>
        <div className="p-4 border-b flex justify-between items-center" style={{ borderBottom: '1px solid #2d2d2d' }}>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#ff0000', fontSize: '1.2rem', margin: 0 }}>
              <Shield size={24} /> NS Messenger
            </h1>
            <span style={{ fontSize: '9px', color: '#666' }}>SECURE CHANNEL ACTIVE</span>
          </div>
          <button className="text-primary p-2 rounded-full hover:bg-dark-700" style={{ background: 'none', border: 'none', color: '#ff0000', cursor: 'pointer' }}>
            <Settings size={20} />
          </button>
        </div>

        <div className="p-3 bg-dark-900 border-b flex items-center gap-3" style={{ borderBottom: '1px solid #2d2d2d' }}>
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center" style={{ width: '32px', height: '32px', backgroundColor: '#ff0000', borderRadius: '50%', flexShrink: 0 }}>
            <User size={16} color="white" />
          </div>
          <div className="flex flex-col truncate">
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{user.name}</span>
            <span style={{ fontSize: '10px', color: '#666' }}>{user.email}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className="p-4 flex items-center gap-3 cursor-pointer transition-colors"
              style={{ 
                backgroundColor: activeChat?.id === chat.id ? '#2d2d2d' : 'transparent',
                borderLeft: activeChat?.id === chat.id ? '4px solid #ff0000' : '4px solid transparent',
              }}
            >
              <div className="w-12 h-12 bg-dark-600 rounded-full flex items-center justify-center" style={{ width: '45px', height: '45px', backgroundColor: '#3d3d3d', borderRadius: '50%', color: '#ff0000', flexShrink: 0 }}>
                <User size={24} />
              </div>
              <div className="flex-1 truncate">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold truncate" style={{ margin: 0, fontSize: '14px' }}>{chat.name}</h3>
                  <span className="text-xs" style={{ color: '#555', fontSize: '10px' }}>{chat.timestamp}</span>
                </div>
                <p className="text-sm truncate" style={{ color: '#888', margin: 0, fontSize: '12px' }}>{chat.email}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-dark-800 border-t" style={{ borderTop: '1px solid #2d2d2d' }}>
          <button className="w-full bg-primary font-bold p-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer" style={{ width: '100%', backgroundColor: '#ff0000', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <Plus size={18} /> Добавить контакт
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-dark-900" style={{ flex: 1, position: 'relative' }}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-dark-800 border-b flex justify-between items-center" style={{ borderBottom: '1px solid #2d2d2d' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-dark-700 rounded-full flex items-center justify-center" style={{ width: '40px', height: '40px', backgroundColor: '#2d2d2d', borderRadius: '50%', color: '#ff0000' }}>
                  <User size={20} />
                </div>
                <div>
                  <h2 className="font-bold" style={{ margin: 0, fontSize: '16px' }}>{activeChat.name}</h2>
                  <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#00ff00', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Shield size={10} /> SECURE
                    </span>
                    <span style={{ fontSize: '10px', color: '#666' }}>{activeChat.email}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={checkInbox}
                  disabled={isTransporting}
                  style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <RefreshCw size={16} className={isTransporting ? 'animate-spin' : ''} />
                </button>
                <div style={{ textAlign: 'right', borderLeft: '1px solid #333', paddingLeft: '15px' }}>
                  <p style={{ fontSize: '8px', color: '#555', margin: 0, textTransform: 'uppercase' }}>Session Key</p>
                  <p style={{ fontSize: '10px', color: '#ff0000', margin: 0, fontFamily: 'monospace' }}>{sessionKey?.substring(0, 12)}...</p>
                </div>
              </div>
            </div>

            {/* Transport Status Overlay */}
            {isTransporting && (
              <div style={{ 
                position: 'absolute', 
                top: '70px', 
                left: '50%', 
                transform: 'translateX(-50%)', 
                backgroundColor: '#ff0000', 
                color: 'white', 
                padding: '4px 15px', 
                borderRadius: '20px', 
                fontSize: '10px', 
                fontWeight: 'bold',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(255,0,0,0.3)'
              }}>
                <Loader2 size={12} className="animate-spin" />
                {transportStatus}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ flex: 1, padding: '20px' }}>
              {messages.map((msg) => (
                <div key={msg.id} className="flex" style={{ display: 'flex', marginBottom: '20px', justifyContent: msg.isSystem ? 'center' : msg.sender === 'me' ? 'flex-end' : 'flex-start' }}>
                  {msg.isSystem ? (
                    <span style={{ backgroundColor: '#1a1a1a', color: '#444', fontSize: '9px', padding: '3px 10px', borderRadius: '4px', border: '1px solid #222', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {msg.text}
                    </span>
                  ) : (
                    <div style={{ position: 'relative', maxWidth: '75%' }}>
                      <div style={{ 
                        padding: '12px 16px', 
                        borderRadius: '12px',
                        backgroundColor: msg.sender === 'me' ? '#ff0000' : '#2d2d2d',
                        color: 'white',
                        borderBottomRightRadius: msg.sender === 'me' ? '2px' : '12px',
                        borderBottomLeftRadius: msg.sender === 'me' ? '12px' : '2px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
                      }}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>{msg.text}</p>
                        <div style={{ fontSize: '9px', marginTop: '6px', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                          <span>{msg.timestamp}</span>
                          {msg.sender === 'me' && (
                            msg.status === 'sending' ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-4 bg-dark-800 border-t" style={{ padding: '15px', borderTop: '1px solid #2d2d2d' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Зашифрованное сообщение..." 
                    style={{ width: '100%', backgroundColor: '#2d2d2d', border: 'none', borderRadius: '8px', padding: '14px', color: 'white', outline: 'none', fontSize: '14px' }}
                  />
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#555' }}>
                    <Lock size={16} />
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || isTransporting}
                  style={{ 
                    backgroundColor: newMessage.trim() ? '#ff0000' : '#333', 
                    border: 'none', 
                    borderRadius: '8px', 
                    width: '50px', 
                    height: '50px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: 'white', 
                    cursor: newMessage.trim() ? 'pointer' : 'default',
                  }}
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
            <Mail size={80} style={{ marginBottom: '20px', opacity: 0.1 }} />
            <h2 style={{ color: '#444', margin: 0 }}>NS Messenger</h2>
            <p style={{ fontSize: '14px' }}>Выберите контакт для начала общения</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}

export default App;
