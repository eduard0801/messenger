import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, Mic, LogOut, Plus, Users, Circle } from 'lucide-react';
import { useAuth } from '../App';

interface Chat {
  id: string;
  type: 'private' | 'group';
  name?: string;
  lastMessage?: string;
  lastMessageAt?: number;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  username: string;
  content?: string;
  type: 'text' | 'image' | 'file' | 'voice';
  fileUrl?: string;
  fileName?: string;
  createdAt: number;
}

export default function ChatApp() {
  const { user, token, logout, socket } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState<string[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXvzn0vBSF1xe/glEILElyx6OyrWBUIRJzd8sFuJAUuhM/z2Ik2CBhku+zooVARC0yl4fG5ZRwFNo3V7859LwUhdcf');
  }, []);

  const playNotification = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const showBrowserNotification = (title: string, body: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    fetch('/api/chats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setChats);
  }, [token]);

  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', (msg: Message) => {
      if (msg.chatId === activeChat) {
        setMessages(prev => [...prev, msg]);
      } else if (msg.senderId !== user?.id) {
        playNotification();
        const chat = chats.find(c => c.id === msg.chatId);
        showBrowserNotification(chat?.name || msg.username || 'New message', msg.content || 'File');
      }
      setChats(prev => prev.map(c => c.id === msg.chatId ? { ...c, lastMessage: msg.content || 'File', lastMessageAt: msg.createdAt } : c));
    });

    socket.on('typing:start', ({ userId, username, chatId }) => {
      if (chatId === activeChat && userId !== user?.id) {
        setTyping(prev => [...new Set([...prev, username])]);
      }
    });

    socket.on('typing:stop', ({ chatId }) => {
      if (chatId === activeChat) setTyping([]);
    });

    socket.on('user:status', ({ userId, status }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    return () => {
      socket.off('message:new');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:status');
    };
  }, [socket, activeChat, user, chats]);

  useEffect(() => {
    if (activeChat) {
      socket?.emit('chat:join', activeChat);
      fetch(`/api/chats/${activeChat}/messages`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(setMessages);
    }
  }, [activeChat, socket, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !activeChat || !socket) return;
    socket.emit('message:send', { chatId: activeChat, content: input.trim(), type: 'text' });
    setInput('');
    socket.emit('typing:stop', activeChat);
  };

  const handleTyping = (value: string) => {
    setInput(value);
    if (socket && activeChat) {
      socket.emit(value ? 'typing:start' : 'typing:stop', activeChat);
    }
  };

  const uploadFile = async (file: File) => {
    if (!activeChat) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    socket?.emit('message:send', {
      chatId: activeChat,
      type: data.type,
      fileUrl: data.url,
      fileName: data.name,
      content: data.name
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: 'audio/webm' });
        uploadFile(file);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      alert('No microphone access');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) return setSearchResults([]);
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setSearchResults(await res.json());
  };

  const createPrivateChat = async (userId: string) => {
    const res = await fetch('/api/chats/private', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId })
    });
    const { chatId } = await res.json();
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);
    const chatsRes = await fetch('/api/chats', { headers: { Authorization: `Bearer ${token}` } });
    setChats(await chatsRes.json());
    setActiveChat(chatId);
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    const res = await fetch('/api/chats/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: groupName, memberIds: selectedMembers })
    });
    const { chatId } = await res.json();
    setShowNewGroup(false);
    setGroupName('');
    setSelectedMembers([]);
    const chatsRes = await fetch('/api/chats', { headers: { Authorization: `Bearer ${token}` } });
    setChats(await chatsRes.json());
    setActiveChat(chatId);
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const currentChat = chats.find(c => c.id === activeChat);

  return (
    <div className="h-screen flex bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="w-80 border-r border-white/10 flex flex-col bg-black/30 backdrop-blur-xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-lg shadow-lg">
                {user?.username[0].toUpperCase()}
              </div>
              <Circle size={10} className="absolute -bottom-0.5 -right-0.5 fill-green-400 text-green-400" />
            </div>
            <div>
              <div className="font-semibold">{user?.username}</div>
              <div className="text-xs text-green-400">online</div>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setShowNewChat(true)} className="p-2 hover:bg-white/10 rounded-xl transition" title="New chat"><Plus size={20} /></button>
            <button onClick={() => setShowNewGroup(true)} className="p-2 hover:bg-white/10 rounded-xl transition" title="New group"><Users size={20} /></button>
            <button onClick={logout} className="p-2 hover:bg-white/10 rounded-xl transition"><LogOut size={20} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <button key={chat.id} onClick={() => setActiveChat(chat.id)} className={`w-full p-4 text-left hover:bg-white/5 transition flex items-center gap-3 ${activeChat === chat.id ? 'bg-white/10 border-l-2 border-indigo-500' : ''}`}>
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow">
                  {chat.type === 'group' ? <Users size={22} /> : (chat.name?.[0] || '?')}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{chat.name || 'Private chat'}</div>
                <div className="text-sm text-gray-400 truncate">{chat.lastMessage || 'No messages'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            <div className="p-4 border-b border-white/10 bg-black/20 backdrop-blur flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                {currentChat?.type === 'group' ? <Users size={18} /> : currentChat?.name?.[0] || '?'}
              </div>
              <div>
                <div className="font-semibold">{currentChat?.name || 'Chat'}</div>
                {typing.length > 0 ? <div className="text-sm text-indigo-400 animate-pulse">{typing.join(', ')} typing...</div> : <div className="text-xs text-gray-400">{currentChat?.type === 'group' ? 'Group' : 'Private'}</div>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence>
                {messages.map(msg => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md px-4 py-2.5 rounded-2xl shadow-lg ${msg.senderId === user?.id ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-md' : 'bg-white/10 backdrop-blur rounded-bl-md'}`}>
                      {msg.senderId !== user?.id && <div className="text-xs text-indigo-300 mb-1 font-medium">{msg.username}</div>}
                      {msg.type === 'image' && msg.fileUrl && <img src={msg.fileUrl} alt="" className="rounded-xl max-w-full mb-1" />}
                      {msg.type === 'voice' && msg.fileUrl && <audio controls src={msg.fileUrl} className="mb-1 h-8" />}
                      {msg.type === 'file' && msg.fileUrl && <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="underline"><Paperclip size={14} /> {msg.fileName || 'File'}</a>}
                      {msg.type === 'text' && <p className="leading-relaxed">{msg.content}</p>}
                      <div className="text-[10px] opacity-60 text-right mt-1">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-white/10 bg-black/20">
              <div className="flex items-center gap-2 bg-white/5 rounded-2xl px-3 py-1.5 border border-white/10">
                <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-white/10 rounded-xl"><Paperclip size={20} /></button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                <input value={input} onChange={e => handleTyping(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} placeholder="Message..." className="flex-1 bg-transparent outline-none py-2.5 text-sm" />
                <button onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={() => isRecording && stopRecording()} className={`p-2 rounded-xl ${isRecording ? 'bg-red-500 animate-pulse' : 'hover:bg-white/10'}`}><Mic size={20} /></button>
                <button onClick={sendMessage} className="p-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl"><Send size={18} /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center"><Send size={32} className="opacity-40" /></div>
            <div>Select a chat or create new</div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {showNewChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowNewChat(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-slate-900/90 backdrop-blur-xl p-6 rounded-3xl w-full max-w-md border border-white/10">
              <h2 className="text-xl font-bold mb-4">New chat</h2>
              <input placeholder="Search users..." value={searchQuery} onChange={e => searchUsers(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-4 outline-none" />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => createPrivateChat(u.id)} className="w-full p-3 text-left hover:bg-white/10 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">{u.username[0].toUpperCase()}</div>
                    <div>{u.username}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowNewGroup(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-slate-900/90 backdrop-blur-xl p-6 rounded-3xl w-full max-w-md border border-white/10">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20} /> New group</h2>
              <input placeholder="Group name" value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-3 outline-none" />
              <input placeholder="Search members..." value={searchQuery} onChange={e => searchUsers(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-3 outline-none" />
              <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => toggleMember(u.id)} className={`w-full p-3 text-left rounded-xl flex items-center gap-3 ${selectedMembers.includes(u.id) ? 'bg-indigo-600/40' : 'hover:bg-white/10'}`}>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm">{u.username[0].toUpperCase()}</div>
                    {u.username}
                    {selectedMembers.includes(u.id) && <span className="ml-auto text-xs">OK</span>}
                  </button>
                ))}
              </div>
              <button onClick={createGroup} disabled={!groupName.trim() || selectedMembers.length === 0} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-medium disabled:opacity-40">Create group ({selectedMembers.length})</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
