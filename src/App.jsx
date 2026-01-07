import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Lock, MessageSquare, Settings, Shield, User, Mail, 
  Plus, Loader2, CheckCheck, RefreshCw, ArrowRight, Menu, X, 
  Trash2, UserPlus, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateSessionKey, encryptMessage, decryptMessage } from './crypto';
import { emailService } from './emailService';
import { cn } from './utils';

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
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  const scrollRef = useRef(null);

  // Загрузка данных при старте
  useEffect(() => {
    const savedUser = localStorage.getItem('ns_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    const savedChats = localStorage.getItem('ns_chats');
    if (savedChats) {
      setChats(JSON.parse(savedChats));
    } else {
      // Пустой список по умолчанию
      setChats([]);
    }
  }, []);

  // Сохранение чатов
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('ns_chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Генерируем новый ключ при заходе в чат
  useEffect(() => {
    if (activeChat) {
      const newKey = generateSessionKey();
      setSessionKey(newKey);
      
      // Загружаем историю сообщений для этого чата из localStorage
      const chatHistory = localStorage.getItem(`ns_history_${activeChat.email}`);
      if (chatHistory) {
        setMessages(JSON.parse(chatHistory));
      } else {
        setMessages([
          { id: 'sys_1', text: `--- ЗАЩИЩЕННЫЙ КАНАЛ УСТАНОВЛЕН ---`, isSystem: true },
          { id: 'sys_2', text: 'Все сообщения шифруются AES-256. Ключ сессии обновлен.', sender: 'system', timestamp: 'now' }
        ]);
      }
      checkInbox();
    }
  }, [activeChat]);

  // Сохранение истории сообщений
  useEffect(() => {
    if (activeChat && messages.length > 0) {
      localStorage.setItem(`ns_history_${activeChat.email}`, JSON.stringify(messages));
    }
  }, [messages, activeChat]);

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

  const handleLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти? Все локальные данные будут сохранены.')) {
      setUser(null);
    }
  };

  const checkInbox = async () => {
    if (!activeChat || !user || !sessionKey) return;
    setIsTransporting(true);
    setTransportStatus('Проверка входящих шлюзов...');
    
    try {
      const inbox = await emailService.fetchInbox(user.email);
      const chatEmails = inbox.filter(mail => mail.from === activeChat.email);
      
      let newMsgsFound = false;
      const updatedMessages = [...messages];

      chatEmails.forEach(mail => {
        // Проверяем, нет ли уже такого сообщения в истории
        if (!messages.find(m => m.id === mail.id || m.encrypted === mail.body)) {
          const decrypted = decryptMessage(mail.body, sessionKey);
          
          if (decrypted) {
            newMsgsFound = true;
            updatedMessages.push({
              id: mail.id,
              text: decrypted,
              encrypted: mail.body,
              sender: 'partner',
              timestamp: new Date(mail.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      });

      if (newMsgsFound) {
        setMessages(updatedMessages);
      }
    } finally {
      setTimeout(() => {
        setIsTransporting(false);
        setTransportStatus('');
      }, 800);
    }
  };

  const handleImportEncrypted = async () => {
    const text = prompt('Вставьте зашифрованный текст из письма:');
    if (!text || !sessionKey) return;

    // Пытаемся найти блок зашифрованного текста в письме
    const match = text.match(/--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n([\s\S]+?)\n\n---/);
    const encryptedData = match ? match[1].trim() : text.trim();

    const decrypted = decryptMessage(encryptedData, sessionKey);
    if (decrypted) {
      const msgObj = {
        id: Date.now(),
        text: decrypted,
        encrypted: encryptedData,
        sender: 'partner',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, msgObj]);
    } else {
      alert('Ошибка: Не удалось расшифровать. Возможно, неверный ключ сессии.');
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
    setTransportStatus('Шифрование и отправка...');
    
    try {
      await emailService.sendAsEmail({
        to: activeChat.email,
        from: user.email,
        subject: `NS_MSG_${tempId}`,
        encryptedBody: encrypted,
        metadata: { sessionId: sessionKey.substring(0, 8) }
      });
      
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));
    } catch (err) {
      setTransportStatus('Ошибка отправки!');
    } finally {
      setTimeout(() => {
        setIsTransporting(false);
        setTransportStatus('');
      }, 1000);
    }
  };

  const addContact = (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactEmail.trim()) return;
    
    const newContact = {
      id: Date.now(),
      name: newContactName,
      email: newContactEmail,
      lastMessage: 'Контакт добавлен',
      timestamp: 'Только что'
    };
    
    setChats(prev => [newContact, ...prev]);
    setNewContactName('');
    setNewContactEmail('');
    setIsAddContactOpen(false);
  };

  const deleteContact = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Удалить контакт и историю переписки?')) {
      const contact = chats.find(c => c.id === id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (activeChat?.id === id) setActiveChat(null);
      localStorage.removeItem(`ns_history_${contact.email}`);
    }
  };

  // Экран регистрации
  if (!user) {
    return (
      <div className="flex h-screen bg-black items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl shadow-2xl text-center"
        >
          <div className="mb-8">
            <div className="inline-flex p-5 bg-[#1a0000] border border-[#330000] rounded-full text-[#ff0000] mb-6">
              <Shield size={48} strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white mb-2 uppercase">NS Messenger</h1>
            <p className="text-[#666] text-sm">Вход в защищенный узел связи</p>
          </div>

          <form onSubmit={handleRegister} className="flex flex-col gap-5">
            <div className="text-left">
              <label className="text-[10px] font-bold text-[#444] mb-2 block uppercase tracking-widest">Идентификатор</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Ваш позывной" 
                  required
                  className="w-full bg-[#111] border border-[#222] rounded-xl py-4 pl-12 pr-4 text-white placeholder-[#333] outline-none focus:border-[#ff0000] transition-all"
                />
                <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ff0000]" />
              </div>
            </div>

            <div className="text-left">
              <label className="text-[10px] font-bold text-[#444] mb-2 block uppercase tracking-widest">Почтовый шлюз</label>
              <div className="relative">
                <input 
                  type="email" 
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="email@example.com" 
                  required
                  className="w-full bg-[#111] border border-[#222] rounded-xl py-4 pl-12 pr-4 text-white placeholder-[#333] outline-none focus:border-[#ff0000] transition-all"
                />
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ff0000]" />
              </div>
            </div>

            <button 
              type="submit"
              className="mt-4 bg-[#ff0000] hover:bg-[#cc0000] text-white py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-[#ff000022]"
            >
              Инициализировать <ArrowRight size={20} />
            </button>
          </form>

          <p className="mt-8 text-[10px] text-[#333] leading-relaxed uppercase tracking-tighter">
            Шифрование AES-256 • Локальное хранение • Нулевая отчетность
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* Sidebar Overlay for mobile */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed bottom-6 left-6 z-50 p-4 bg-[#ff0000] rounded-full shadow-xl shadow-[#ff000044] md:hidden"
          >
            <Menu size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? '320px' : '0px',
          opacity: isSidebarOpen ? 1 : 0
        }}
        className={cn(
          "h-full bg-[#050505] border-r border-[#1a1a1a] flex flex-col z-40 overflow-hidden relative",
          !isSidebarOpen && "border-none"
        )}
      </motion.div>

      {/* Real Sidebar Content (to keep it stable during animation) */}
      <div 
        className="fixed top-0 left-0 h-full flex flex-col bg-[#050505] border-r border-[#1a1a1a] z-40 transition-all duration-300"
        style={{ width: isSidebarOpen ? '320px' : '0px', visibility: isSidebarOpen ? 'visible' : 'hidden' }}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-[#1a1a1a] flex justify-between items-center bg-[#080808]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1a0000] rounded-lg text-[#ff0000]">
              <Shield size={20} />
            </div>
            <h1 className="text-lg font-black uppercase tracking-tighter">NS MSGR</h1>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-[#111] rounded-lg text-[#444] transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* User Profile Info */}
        <div className="p-4 bg-[#0a0a0a] border-b border-[#1a1a1a] flex items-center gap-3 group">
          <div className="w-10 h-10 bg-[#111] border border-[#222] rounded-full flex items-center justify-center text-[#ff0000]">
            <User size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate uppercase tracking-tight">{user.name}</p>
            <p className="text-[10px] text-[#444] truncate">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-[#333] hover:text-[#ff0000] transition-colors">
            <LogOut size={16} />
          </button>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {chats.length === 0 ? (
            <div className="p-10 text-center">
              <UserPlus size={40} className="mx-auto mb-4 text-[#111]" />
              <p className="text-xs text-[#333] uppercase font-bold tracking-widest">Список пуст</p>
            </div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={cn(
                  "p-4 flex items-center gap-4 cursor-pointer transition-all border-b border-[#0a0a0a] group",
                  activeChat?.id === chat.id ? "bg-[#111] border-l-4 border-l-[#ff0000]" : "hover:bg-[#080808] border-l-4 border-l-transparent"
                )}
              >
                <div className="w-12 h-12 bg-[#111] rounded-xl flex items-center justify-center text-[#444] group-hover:text-[#ff0000] transition-colors">
                  <User size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-sm font-black uppercase tracking-tight truncate">{chat.name}</h3>
                    <span className="text-[9px] text-[#333] font-mono">{chat.timestamp}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[11px] text-[#555] truncate">{chat.email}</p>
                    <button 
                      onClick={(e) => deleteContact(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#333] hover:text-[#ff0000] transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Contact Button */}
        <div className="p-4 bg-[#080808] border-t border-[#1a1a1a]">
          <button 
            onClick={() => setIsAddContactOpen(true)}
            className="w-full bg-white hover:bg-[#ff0000] text-black hover:text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Plus size={18} /> Добавить контакт
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-black relative min-w-0">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-6 left-6 z-30 p-2 bg-[#111] border border-[#222] rounded-lg text-[#ff0000] hover:bg-[#1a0000] transition-all"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="h-20 px-8 bg-[#050505] border-b border-[#1a1a1a] flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#111] border border-[#222] rounded-xl flex items-center justify-center text-[#ff0000]">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest">{activeChat.name}</h2>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[9px] text-[#00ff00] font-bold">
                      <div className="w-1 h-1 bg-[#00ff00] rounded-full animate-pulse" />
                      ENCRYPTED
                    </span>
                    <span className="text-[10px] text-[#333]">{activeChat.email}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <button 
                  onClick={handleImportEncrypted}
                  title="Импорт из почты"
                  className="p-2 text-[#444] hover:text-[#ff0000] transition-colors"
                >
                  <Plus size={20} />
                </button>
                <button 
                  onClick={checkInbox}
                  disabled={isTransporting}
                  className="p-2 text-[#444] hover:text-white transition-colors disabled:opacity-20"
                >
                  <RefreshCw size={20} className={isTransporting ? 'animate-spin' : ''} />
                </button>
                <div className="hidden md:block pl-6 border-l border-[#1a1a1a] text-right">
                  <p className="text-[8px] text-[#333] uppercase font-black mb-1">Session Node</p>
                  <p className="text-[10px] text-[#ff0000] font-mono tracking-tighter">{sessionKey?.substring(0, 16)}</p>
                </div>
              </div>
            </div>

            {/* Transport Status */}
            <AnimatePresence>
              {isTransporting && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-24 left-1/2 -translate-x-1/2 z-20"
                >
                  <div className="bg-[#ff0000] text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-[#ff000044] flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    {transportStatus}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex flex-col",
                    msg.isSystem ? "items-center" : msg.sender === 'me' ? "items-end" : "items-start"
                  )}
                >
                  {msg.isSystem ? (
                    <div className="px-4 py-1 bg-[#080808] border border-[#111] rounded text-[9px] text-[#333] uppercase font-bold tracking-[0.2em]">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="max-w-[80%] md:max-w-[60%] group">
                      <div 
                        className={cn(
                          "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-lg",
                          msg.sender === 'me' 
                            ? "bg-[#ff0000] text-white rounded-tr-none" 
                            : "bg-[#111] text-[#ccc] border border-[#1a1a1a] rounded-tl-none"
                        )}
                      >
                        {msg.text}
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 mt-2 px-1 text-[9px] font-bold uppercase tracking-tighter transition-opacity",
                        msg.sender === 'me' ? "justify-end text-[#444]" : "text-[#333]"
                      )}>
                        <span>{msg.timestamp}</span>
                        {msg.sender === 'me' && (
                          msg.status === 'sending' ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} className="text-[#ff0000]" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-6 bg-[#050505] border-t border-[#1a1a1a]">
              <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-4">
                <div className="flex-1 relative group">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Введите защищенное сообщение..." 
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl py-4 pl-6 pr-14 text-sm text-white placeholder-[#222] outline-none focus:border-[#333] transition-all shadow-inner"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[#1a1a1a] group-focus-within:text-[#ff0000] transition-colors">
                    <Lock size={18} />
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || isTransporting}
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg",
                    newMessage.trim() 
                      ? "bg-[#ff0000] text-white shadow-[#ff000022] hover:bg-[#cc0000]" 
                      : "bg-[#0a0a0a] text-[#1a1a1a] border border-[#1a1a1a]"
                  )}
                >
                  <Send size={22} strokeWidth={2.5} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative mb-8"
            >
              <div className="absolute inset-0 bg-[#ff0000] blur-[100px] opacity-10 animate-pulse" />
              <Shield size={120} className="text-[#080808] relative z-10" strokeWidth={0.5} />
            </motion.div>
            <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-[#111] mb-2">NS Messenger</h2>
            <p className="text-[#222] text-xs font-bold uppercase tracking-widest">Выберите узел для начала передачи данных</p>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddContactOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddContactOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-[#0a0a0a] border border-[#1a1a1a] rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-3">
                <UserPlus className="text-[#ff0000]" /> Новый контакт
              </h2>
              <form onSubmit={addContact} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-[#444] mb-2 block uppercase tracking-widest">Имя / Позывной</label>
                  <input 
                    type="text" 
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    required
                    autoFocus
                    className="w-full bg-[#111] border border-[#222] rounded-xl py-3 px-4 text-white outline-none focus:border-[#ff0000] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#444] mb-2 block uppercase tracking-widest">Почтовый адрес</label>
                  <input 
                    type="email" 
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    required
                    className="w-full bg-[#111] border border-[#222] rounded-xl py-3 px-4 text-white outline-none focus:border-[#ff0000] transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddContactOpen(false)}
                    className="flex-1 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest border border-[#222] hover:bg-[#111] transition-all"
                  >
                    Отмена
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-[#ff0000] hover:bg-[#cc0000] py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all"
                  >
                    Добавить
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #111;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff0000;
        }
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
