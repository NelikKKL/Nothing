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
  const [googleClientId, setGoogleClientId] = useState(localStorage.getItem('ns_google_client_id') || '');
  
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionKey, setSessionKey] = useState(null);
  const [isKeyEstablished, setIsKeyEstablished] = useState(false);
  const [isTransporting, setIsTransporting] = useState(false);
  const [transportStatus, setTransportStatus] = useState('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chats, setChats] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  const scrollRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('ns_user');
    if (savedUser) setUser(JSON.parse(savedUser));
    const savedChats = localStorage.getItem('ns_chats');
    if (savedChats) setChats(JSON.parse(savedChats));
  }, []);

  const handleGoogleLogin = () => {
    if (!googleClientId) {
      const id = prompt("Введите ваш Google Client ID (из Google Cloud Console):");
      if (id) {
        setGoogleClientId(id);
        localStorage.setItem('ns_google_client_id', id);
      } else return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
        callback: (response) => {
          if (response.access_token) {
            emailService.setAccessToken(response.access_token);
            // Получаем данные профиля через токен
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            })
            .then(res => res.json())
            .then(data => {
              const newUser = { 
                name: data.name, 
                email: data.email, 
                avatar: data.picture,
                mode: 'api' // Режим с Google API
              };
              localStorage.setItem('ns_user', JSON.stringify(newUser));
              setUser(newUser);
            });
          }
        },
      });
      client.requestAccessToken();
    } catch (e) {
      alert("Ошибка Google Auth. Проверьте Client ID в настройках.");
    }
  };

  useEffect(() => {
    if (chats.length > 0) localStorage.setItem('ns_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    if (activeChat) {
      const savedKey = localStorage.getItem(`ns_key_${activeChat.email}`);
      if (savedKey) {
        setSessionKey(savedKey);
        setIsKeyEstablished(true);
      } else {
        setSessionKey(null);
        setIsKeyEstablished(false);
      }
      
      const chatHistory = localStorage.getItem(`ns_history_${activeChat.email}`);
      if (chatHistory) {
        setMessages(JSON.parse(chatHistory));
      } else {
        setMessages([
          { id: 'sys_1', text: `--- ОЖИДАНИЕ КЛЮЧА ШИФРОВАНИЯ ---`, isSystem: true },
          { id: 'sys_2', text: 'Для начала общения необходимо обменяться ключами безопасности.', sender: 'system', timestamp: 'now' }
        ]);
      }
      checkInbox();
    }
  }, [activeChat]);

  const handleSendKey = async () => {
    if (!activeChat || !user) return;
    const newKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const keyMsg = `NS_KEY_SHARE:${newKey}`;
    
    setIsTransporting(true);
    setTransportStatus('Отправка ключа...');
    try {
      await emailService.sendAsEmail({
        to: activeChat.email,
        from: user.email,
        subject: `NS_KEY_EXCHANGE`,
        encryptedBody: keyMsg,
        metadata: { type: 'key_exchange' }
      });
      
      setSessionKey(newKey);
      setIsKeyEstablished(true);
      localStorage.setItem(`ns_key_${activeChat.email}`, newKey);
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: "ВЫ ОТПРАВИЛИ КЛЮЧ БЕЗОПАСНОСТИ. Ожидайте подтверждения.",
        isSystem: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTransporting(false);
      setTransportStatus('');
    }
  };

  const handleAcceptKey = (key) => {
    if (!activeChat) return;
    setSessionKey(key);
    setIsKeyEstablished(true);
    localStorage.setItem(`ns_key_${activeChat.email}`, key);
    setMessages(prev => [...prev, {
      id: Date.now(),
      text: "КЛЮЧ ПРИНЯТ. КАНАЛ ЗАШИФРОВАН.",
      isSystem: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  useEffect(() => {
    if (activeChat && messages.length > 0) {
      localStorage.setItem(`ns_history_${activeChat.email}`, JSON.stringify(messages));
    }
  }, [messages, activeChat]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleRegister = (e) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) return;
    const newUser = { 
      name: regName, 
      email: regEmail, 
      mode: 'manual', // Режим без Google API
      avatar: null 
    };
    localStorage.setItem('ns_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  useEffect(() => {
    if (user) {
      const sync = async () => {
        setIsSyncing(true);
        try {
          const allEmails = await emailService.fetchInbox(user.email);
          // Группируем сообщения по чатам
          const updatedChats = [...chats];
          let hasChanges = false;

          allEmails.forEach(mail => {
            const chatIndex = updatedChats.findIndex(c => c.email === mail.from);
            if (chatIndex !== -1) {
              const chat = updatedChats[chatIndex];
              if (!chat.messages.find(m => m.id === mail.id)) {
                chat.messages.push({
                  id: mail.id,
                  text: mail.body,
                  sender: 'them',
                  timestamp: mail.sentAt,
                  isEncrypted: true
                });
                chat.lastMessage = "Зашифрованное сообщение";
                chat.timestamp = mail.sentAt;
                hasChanges = true;
              }
            }
          });

          if (hasChanges) {
            setChats(updatedChats);
            localStorage.setItem('ns_chats', JSON.stringify(updatedChats));
          }
          setLastSyncTime(new Date());
        } catch (e) {
          console.error("Sync failed:", e);
        } finally {
          setIsSyncing(false);
        }
      };

      sync();
      const interval = setInterval(sync, 30000); // Синхронизация каждые 30 секунд
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти?')) setUser(null);
  };

  const checkInbox = async () => {
    if (!activeChat || !user) return;
    setIsTransporting(true);
    setTransportStatus('Проверка шлюзов...');
    try {
      const inbox = await emailService.fetchInbox(user.email);
      const chatEmails = inbox.filter(mail => mail.from === activeChat.email);
      let newMsgsFound = false;
      const updatedMessages = [...messages];
      
      chatEmails.forEach(mail => {
        if (!messages.find(m => m.id === mail.id || m.encrypted === mail.body)) {
          // Если это передача ключа
          if (mail.isKeyShare || mail.body.startsWith("NS_KEY_SHARE:")) {
            const key = mail.body.replace("NS_KEY_SHARE:", "");
            newMsgsFound = true;
            updatedMessages.push({
              id: mail.id,
              text: "ПОЛУЧЕН НОВЫЙ КЛЮЧ БЕЗОПАСНОСТИ",
              keyToAccept: key,
              isKeyShare: true,
              sender: 'partner',
              timestamp: new Date(mail.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          } else if (sessionKey) {
            // Обычное сообщение, расшифровываем только если есть ключ
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
        }
      });
      if (newMsgsFound) setMessages(updatedMessages);
    } finally {
      setTimeout(() => { setIsTransporting(false); setTransportStatus(''); }, 800);
    }
  };

  const handleImportEncrypted = async () => {
    const text = prompt('Вставьте зашифрованный текст:');
    if (!text || !sessionKey) return;
    const match = text.match(/--- NS MESSENGER ENCRYPTED MESSAGE ---\n\n([\s\S]+?)\n\n---/);
    const encryptedData = match ? match[1].trim() : text.trim();
    const decrypted = decryptMessage(encryptedData, sessionKey);
    if (decrypted) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: decrypted,
        encrypted: encryptedData,
        sender: 'partner',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } else {
      alert('Ошибка расшифровки!');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !sessionKey || !user) return;
    const textToSend = newMessage;
    setNewMessage('');
    const encrypted = encryptMessage(textToSend, sessionKey);
    const tempId = Date.now();
    setMessages(prev => [...prev, {
      id: tempId,
      text: textToSend,
      encrypted: encrypted,
      sender: 'me',
      status: 'sending',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setIsTransporting(true);
    setTransportStatus('Шифрование...');
    try {
      await emailService.sendAsEmail({
        to: activeChat.email,
        from: user.email,
        subject: `NS_MSG_${tempId}`,
        encryptedBody: encrypted,
        metadata: { sessionId: sessionKey.substring(0, 8) }
      });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));
    } finally {
      setTimeout(() => { setIsTransporting(false); setTransportStatus(''); }, 1000);
    }
  };

  const addContact = (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactEmail.trim()) return;
    const newContact = { id: Date.now(), name: newContactName, email: newContactEmail, lastMessage: 'Добавлен', timestamp: 'now' };
    setChats(prev => [newContact, ...prev]);
    setNewContactName(''); setNewContactEmail(''); setIsAddContactOpen(false);
  };

  const deleteContact = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Удалить контакт?')) {
      const contact = chats.find(c => c.id === id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (activeChat?.id === id) setActiveChat(null);
      localStorage.removeItem(`ns_history_${contact?.email}`);
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen bg-black items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md p-8 bg-[#050505] border border-[#ff000033] rounded-[2rem] shadow-[0_0_50px_rgba(255,0,0,0.15)] text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ff0000] to-transparent" />
          
          <div className="mb-8">
            <div className="inline-flex p-6 bg-[#1a0000] border border-[#ff000044] rounded-3xl text-[#ff0000] mb-6 shadow-[0_0_30px_rgba(255,0,0,0.2)]">
              <Shield size={64} strokeWidth={1.2} />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white mb-2 uppercase italic">NS <span className="text-[#ff0000] drop-shadow-[0_0_10px_#ff0000]">Messenger</span></h1>
            <p className="text-[#444] text-[10px] font-bold uppercase tracking-[0.4em]">Secure Communication Node</p>
          </div>

          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="text-left">
              <div className="relative group">
                <input 
                  type="text" 
                  value={regName} 
                  onChange={(e) => setRegName(e.target.value)} 
                  placeholder="ПОЗЫВНОЙ" 
                  required 
                  className="w-full bg-[#0a0a0a] border border-[#222] group-focus-within:border-[#ff0000] rounded-2xl py-4 pl-14 pr-4 text-white placeholder-[#333] outline-none transition-all" 
                />
                <User size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#444] group-focus-within:text-[#ff0000] transition-colors" />
              </div>
            </div>
            <div className="text-left">
              <div className="relative group">
                <input 
                  type="email" 
                  value={regEmail} 
                  onChange={(e) => setRegEmail(e.target.value)} 
                  placeholder="EMAIL ШЛЮЗ" 
                  required 
                  className="w-full bg-[#0a0a0a] border border-[#222] group-focus-within:border-[#ff0000] rounded-2xl py-4 pl-14 pr-4 text-white placeholder-[#333] outline-none transition-all" 
                />
                <Mail size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#444] group-focus-within:text-[#ff0000] transition-colors" />
              </div>
            </div>
            <button type="submit" className="mt-2 bg-[#ff0000] hover:bg-[#cc0000] text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_10px_25px_rgba(255,0,0,0.3)]">
              ВХОД В СЕТЬ <ArrowRight size={20} />
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1a1a1a]"></div></div>
            <div className="relative flex justify-center text-[9px] uppercase font-black tracking-[0.3em]"><span className="bg-[#050505] px-4 text-[#333]">ИЛИ БЫСТРЫЙ ВХОД ЧЕРЕЗ GMAIL API</span></div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-[#111] border border-[#222] hover:border-[#ff000033] text-white py-4 rounded-2xl font-black uppercase tracking-[0.1em] flex items-center justify-center gap-3 transition-all active:scale-95 group"
          >
            <div className="p-1 bg-white rounded-md group-hover:shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all">
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="G" />
            </div>
            GOOGLE AUTH
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden selection:bg-[#ff0000] selection:text-white">
      {/* Mobile Sidebar Toggle - Ultra small and stylish */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.button 
            initial={{ opacity: 0, scale: 0.5 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.5 }} 
            onClick={() => setIsSidebarOpen(true)} 
            className="fixed top-4 left-4 z-50 w-12 h-12 flex items-center justify-center bg-[#0a0a0a] border-2 border-[#ff0000] rounded-full shadow-[0_0_25px_rgba(255,0,0,0.6)] md:hidden text-[#ff0000]"
          >
            <Menu size={20} strokeWidth={3} />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="fixed top-0 left-0 h-full flex flex-col bg-[#050505] border-r-2 border-[#ff0000] z-40 transition-all duration-300 shadow-[20px_0_50px_rgba(255,0,0,0.15)]" style={{ width: isSidebarOpen ? '300px' : '0px', visibility: isSidebarOpen ? 'visible' : 'hidden' }}>
        <div className="p-6 border-b border-[#ff000044] flex justify-between items-center bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#ff0000] rounded-xl text-white shadow-[0_0_20px_rgba(255,0,0,0.8)]">
              <Shield size={20} strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white uppercase italic">NS <span className="text-[#ff0000] drop-shadow-[0_0_5px_#ff0000]">MSG</span></h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-[#ff000022] rounded-full text-[#ff0000] transition-all">
            <ChevronLeft size={24} strokeWidth={3} />
          </button>
        </div>

        <div className="p-5 bg-[#080808] border-b border-[#ff000044] flex items-center gap-4">
          <div className="w-12 h-12 bg-[#111] border-2 border-[#ff0000] rounded-full flex items-center justify-center text-[#ff0000] shadow-[0_0_15px_rgba(255,0,0,0.4)] overflow-hidden">
            {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" alt="" /> : <User size={24} strokeWidth={2.5} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black truncate text-white uppercase tracking-tight">{user.name}</p>
            <p className="text-[10px] text-[#ff0000] truncate font-black tracking-widest uppercase opacity-90">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-[#444] hover:text-[#ff0000] transition-colors"><LogOut size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/60">
          {chats.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-[#111] border-2 border-[#ff000033] rounded-full flex items-center justify-center mx-auto mb-4 text-[#ff0000] shadow-[0_0_30px_rgba(255,0,0,0.15)] opacity-40">
                <UserPlus size={28} />
              </div>
              <p className="text-[11px] text-[#ff0000] font-black uppercase tracking-[0.4em] opacity-60">Нет контактов</p>
            </div>
          ) : (
            <div className="py-3 px-2">
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => {
                    setActiveChat(chat);
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }} 
                  className={cn(
                    "px-4 py-4 flex items-center gap-4 cursor-pointer transition-all rounded-[1.25rem] mb-2 border-2 border-transparent relative group", 
                    activeChat?.id === chat.id 
                      ? "bg-[#ff000022] border-[#ff0000] text-white shadow-[0_0_25px_rgba(255,0,0,0.1)]" 
                      : "hover:bg-[#111] text-[#888] hover:text-white hover:border-[#ff000033]"
                  )}
                >
                  <div className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center transition-all border-2",
                    activeChat?.id === chat.id ? "bg-[#ff0000] border-[#ff0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.5)]" : "bg-[#0a0a0a] border-[#222] text-[#444] group-hover:border-[#ff0000] group-hover:text-[#ff0000]"
                  )}>
                    <User size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <h3 className={cn("text-[13px] font-black uppercase tracking-tight truncate", activeChat?.id === chat.id ? "text-white" : "text-[#ccc]")}>{chat.name}</h3>
                      <span className={cn("text-[8px] font-black uppercase tracking-widest", activeChat?.id === chat.id ? "text-[#ff0000]" : "text-[#444]")}>{chat.timestamp}</span>
                    </div>
                    <p className={cn("text-[10px] truncate font-bold uppercase tracking-tighter", activeChat?.id === chat.id ? "text-white/80" : "text-[#555]")}>{chat.lastMessage}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 bg-[#0a0a0a] border-t-2 border-[#ff000033]">
          <button 
            onClick={() => setIsAddContactOpen(true)} 
            className="w-full bg-[#ff0000] hover:bg-[#cc0000] text-white py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.25em] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_12px_25px_rgba(255,0,0,0.4)]"
          >
            <Plus size={20} strokeWidth={3} /> НАПИСАТЬ
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-black relative min-w-0">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="absolute top-6 left-6 z-30 p-3 bg-[#0a0a0a] border-2 border-[#ff0000] rounded-xl text-[#ff0000] hover:bg-[#ff000011] transition-all shadow-[0_0_20px_rgba(255,0,0,0.3)] hidden md:block"
          >
            <ChevronRight size={24} strokeWidth={3} />
          </button>
        )}

        {activeChat ? (
          <>
            <div className="h-20 px-4 md:px-10 bg-[#0a0a0a] border-b-2 border-[#ff0000] flex justify-between items-center z-30 shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
              <div className="flex items-center gap-4 md:gap-6">
                <button 
                  onClick={() => setIsSidebarOpen(true)} 
                  className={cn("p-2 text-[#ff0000] hover:text-white transition-all md:hidden", isSidebarOpen && "hidden")}
                >
                  <Menu size={24} strokeWidth={3} />
                </button>
                <div className="w-12 h-12 bg-[#111] border-2 border-[#ff0000] rounded-full flex items-center justify-center text-[#ff0000] shadow-[0_0_20px_rgba(255,0,0,0.5)]">
                  <User size={24} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base md:text-xl font-black text-white uppercase tracking-tight truncate italic drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{activeChat.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                      <div className={cn("w-2 h-2 rounded-full", user.mode === 'api' ? (isSyncing ? "bg-blue-500 animate-pulse shadow-[0_0_10px_#3b82f6]" : "bg-green-500 shadow-[0_0_8px_#22c55e]") : "bg-[#ff0000] shadow-[0_0_8px_#ff0000]")}></div>
                      <p className={cn("text-[9px] font-black uppercase tracking-[0.4em]", user.mode === 'api' ? (isSyncing ? "text-blue-500" : "text-green-500") : "text-[#ff0000]")}>
                        {user.mode === 'api' ? (isSyncing ? 'СИНХРОНИЗАЦИЯ...' : 'GMAIL API АКТИВЕН') : 'АВТОНОМНЫЙ РЕЖИМ'}
                      </p>
                    </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                {!isKeyEstablished && (
                  <button 
                    onClick={handleSendKey} 
                    className="hidden md:flex items-center gap-2 px-4 py-2 bg-[#ff0000] text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-[#cc0000] transition-all shadow-[0_0_15px_rgba(255,0,0,0.3)] animate-pulse"
                  >
                    <Lock size={14} /> ОТПРАВИТЬ КЛЮЧ
                  </button>
                )}
                <button onClick={() => checkInbox()} className="p-2.5 text-[#444] hover:text-[#ff0000] transition-all bg-[#111] border border-[#222] rounded-xl hover:border-[#ff000044]" title="Update">
                  <RefreshCw size={20} strokeWidth={2.5} className={cn(isSyncing && "animate-spin text-[#ff0000]")} />
                </button>
                <button onClick={(e) => deleteContact(activeChat.id, e)} className="p-2.5 text-[#444] hover:text-[#ff0000] transition-all bg-[#111] border border-[#222] rounded-xl hover:border-[#ff000044]">
                  <Trash2 size={20} strokeWidth={2.5} />
                </button>
              </div>
            </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 custom-scrollbar bg-black bg-[radial-gradient(circle_at_center,_#ff000008_0%,_transparent_70%)]" ref={scrollRef}>
                  {!isKeyEstablished && (
                    <div className="flex justify-center mb-6 md:hidden">
                      <button 
                        onClick={handleSendKey} 
                        className="w-full max-w-xs flex items-center justify-center gap-3 py-4 bg-[#ff0000] text-white rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] shadow-[0_0_30px_rgba(255,0,0,0.4)] animate-pulse"
                      >
                        <Lock size={18} strokeWidth={3} /> ОТПРАВИТЬ КЛЮЧ
                      </button>
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div 
                    key={msg.id || idx} 
                    initial={{ opacity: 0, y: 15, scale: 0.9 }} 
                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                    className={cn(
                      "flex w-full mb-2",
                      msg.sender === 'me' ? "justify-end" : msg.isSystem ? "justify-center" : "justify-start"
                    )}
                  >
                    {msg.isSystem ? (
                      <div className="bg-[#0a0a0a] border-2 border-[#ff000066] px-6 py-1.5 rounded-full text-[9px] font-black text-[#ff0000] uppercase tracking-[0.5em] shadow-[0_0_20px_rgba(255,0,0,0.2)]">
                        {msg.text}
                      </div>
                    ) : (
                      <div className={cn(
                        "max-w-[85%] md:max-w-[60%] px-5 py-4 rounded-[2rem] relative group shadow-[0_10px_40px_rgba(0,0,0,0.6)] transition-all border-2",
                        msg.sender === 'me' 
                          ? "bg-[#ff0000] border-[#ff0000] text-white rounded-br-none shadow-[0_8px_30px_rgba(255,0,0,0.3)]" 
                          : "bg-[#0a0a0a] text-[#ccc] border-[#ff000044] rounded-bl-none shadow-[0_8px_25px_rgba(0,0,0,0.8)]"
                      )}>
                        <p className="text-[15px] leading-relaxed break-words font-semibold tracking-tight">{msg.text}</p>
                        
                        {msg.isKeyShare && (
                          <button 
                            onClick={() => handleAcceptKey(msg.keyToAccept)}
                            className="mt-3 w-full bg-[#ff0000] text-white py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-[#cc0000] transition-all shadow-[0_5px_15px_rgba(255,0,0,0.4)]"
                          >
                            ПРИНЯТЬ КЛЮЧ
                          </button>
                        )}

                        <div className={cn(
                          "flex items-center gap-2 mt-2 justify-end opacity-60",
                          msg.sender === 'me' ? "text-white" : "text-[#ff0000]"
                        )}>
                          <span className="text-[9px] font-black uppercase tracking-widest">{msg.timestamp}</span>
                          {msg.sender === 'me' && (
                            <div className="flex">
                              {msg.status === 'sent' ? <CheckCheck size={12} strokeWidth={3} className="text-white" /> : <Loader2 size={12} strokeWidth={3} className="animate-spin" />}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTransporting && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-4">
                  <div className="bg-black border-2 border-[#ff0000] px-6 py-2 rounded-full flex items-center gap-3 shadow-[0_0_25px_rgba(255,0,0,0.3)]">
                    <Loader2 size={14} strokeWidth={3} className="text-[#ff0000] animate-spin" />
                    <span className="text-[10px] font-black text-[#ff0000] uppercase tracking-[0.3em] animate-pulse">{transportStatus}</span>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="p-5 md:p-8 bg-[#0a0a0a] border-t-2 border-[#ff0000]">
              <form onSubmit={handleSendMessage} className="max-w-5xl mx-auto relative flex items-end gap-4 md:gap-6">
                <div className="flex-1 relative group">
                  <textarea 
                    value={newMessage} 
                    onChange={(e) => setNewMessage(e.target.value)} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="СООБЩЕНИЕ..."
                    rows="1"
                    className="w-full bg-[#050505] border-2 border-[#222] group-focus-within:border-[#ff0000] rounded-[1.5rem] py-5 pl-7 pr-16 text-white placeholder-[#222] outline-none transition-all resize-none overflow-hidden max-h-40 shadow-2xl text-base font-medium"
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                  />
                  <button 
                    type="button"
                    onClick={handleImportEncrypted}
                    className="absolute right-5 bottom-5 p-2 text-[#222] hover:text-[#ff0000] transition-all bg-[#0a0a0a] rounded-xl border border-[#111] hover:border-[#ff000033]"
                    title="Расшифровать"
                  >
                    <Lock size={20} strokeWidth={2.5} />
                  </button>
                </div>
                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all active:scale-90 border-2",
                    newMessage.trim() 
                      ? "bg-[#ff0000] border-[#ff0000] text-white shadow-[0_0_35px_rgba(255,0,0,0.5)]" 
                      : "bg-[#111] border-[#222] text-[#222] opacity-50 cursor-not-allowed"
                  )}
                >
                  <Send size={28} strokeWidth={3} className={cn(newMessage.trim() && "translate-x-0.5 -translate-y-0.5")} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#ff00000c_0%,_transparent_70%)]" />
            <div className="relative mb-10 scale-125">
              <div className="absolute inset-0 bg-[#ff0000] blur-[100px] opacity-15 animate-pulse" />
              <Shield size={120} className="text-[#111] relative z-10 drop-shadow-[0_0_30px_rgba(255,0,0,0.1)]" strokeWidth={0.2} />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-[0.5em] text-[#1a1a1a] mb-3 relative z-10 italic">NS Messenger</h2>
            <div className="h-0.5 w-24 bg-gradient-to-r from-transparent via-[#ff000044] to-transparent mb-4" />
            <p className="text-[#ff000033] text-[10px] font-black uppercase tracking-[0.8em] relative z-10">Выберите защищенный узел</p>
          </div>
        )}
      </div>
      <AnimatePresence>
        {isAddContactOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddContactOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#050505] border-2 border-[#ff0000] rounded-[2.5rem] p-10 shadow-[0_30px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(255,0,0,0.2)]">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ff0000] to-transparent" />
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-8 flex items-center gap-4 text-white italic"><UserPlus className="text-[#ff0000]" size={28} strokeWidth={2.5} /> НОВЫЙ КОНТАКТ</h2>
              <form onSubmit={addContact} className="space-y-6">
                <div><label className="text-[10px] font-black text-[#444] mb-2.5 block uppercase tracking-[0.3em]">ПОЗЫВНОЙ</label><input type="text" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} required className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-2xl py-4 px-6 text-white outline-none focus:border-[#ff0000] transition-all text-base font-bold shadow-inner" /></div>
                <div><label className="text-[10px] font-black text-[#444] mb-2.5 block uppercase tracking-[0.3em]">EMAIL ШЛЮЗ</label><input type="email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} required className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-2xl py-4 px-6 text-white outline-none focus:border-[#ff0000] transition-all text-base font-bold shadow-inner" /></div>
                <div className="flex gap-4 pt-6"><button type="button" onClick={() => setIsAddContactOpen(false)} className="flex-1 py-4.5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] border-2 border-[#1a1a1a] text-[#444] hover:text-white hover:border-[#333] transition-all">ОТМЕНА</button><button type="submit" className="flex-1 bg-[#ff0000] py-4.5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] text-white shadow-[0_15px_30px_rgba(255,0,0,0.4)] hover:bg-[#cc0000] active:scale-95 transition-all">УСТАНОВИТЬ</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #111; border-radius: 10px; border: 1px solid #222; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ff0000; border-color: #ff0000; shadow: 0 0 10px #ff0000; }`}} />
    </div>
  );
}

export default App;
