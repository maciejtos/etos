import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { 
  collection, query, limit, onSnapshot, 
  addDoc, serverTimestamp, where, orderBy, doc, setDoc, getDocs, updateDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format, formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import clsx from 'clsx';
import { Users, MessageSquare, ChevronLeft, Send, AlertCircle, User, Camera, X } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

export default function Chat() {
  const { currentUser, userRole } = useAuth();
  const { unreadCounts, markAsRead } = useChat();
  const [chatType, setChatType] = useState('global'); // 'global', 'important', 'direct'
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUserList, setShowUserList] = useState(true);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  // Pobierz listę użytkowników i ich status online
  useEffect(() => {
    if (!currentUser) return;

    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const list = snapshot.docs.map(doc => {
          const data = doc.data();
          const lastSeen = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : 0;
          const isOnline = Date.now() - lastSeen < 12 * 60 * 1000; // Tolerancja 12 min (przy heartbeacie 10 min)
          return {
            id: doc.id,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Użytkownik',
            isOnline,
            lastSeen,
            avatarUrl: data.avatarUrl || null
          };
        }).filter(u => u.id !== currentUser.uid).sort((a, b) => {
          const priorityOrder = [
            'arina', 'anita', 'beata', 'mateusz', 'maciej', 
            'alina', 'patrycja', 'maja', 'oksana', 'szymon', 
            'wiktoria', 'julia'
          ];
          const getIndex = (name) => {
            const lower = name.toLowerCase();
            const index = priorityOrder.findIndex(p => lower.includes(p));
            if (index !== -1) return index;
            if (lower.includes('edyta')) return 100;
            if (lower.includes('karol')) return 200;
            return 50; // Inne/Nowe osoby nad Edytą i Karolem
          };
          const indexA = getIndex(a.name);
          const indexB = getIndex(b.name);
          if (indexA !== indexB) return indexA - indexB;
          return a.name.localeCompare(b.name);
        });
        setUsers(list);
      } catch (err) {
        console.error("User list error:", err);
      }
    };

    fetchUsers();
    const interval = setInterval(fetchUsers, 5 * 60 * 1000); // Odświeżaj listę co 5 minut

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // Aktualizuj czas odczytu przy zmianie czatu LUB nowej wiadomości
  useEffect(() => {
    if (!currentUser) return;
    
    // Mark as read if chat is active (either mobile view or desktop view)
    const isMobile = window.innerWidth < 768;
    const isVisible = isMobile ? !showUserList : true;

    if (isVisible) {
      if (chatType === 'global') markAsRead('global');
      else if (chatType === 'important') markAsRead('important');
      else if (chatType === 'direct' && selectedUser) markAsRead('direct', selectedUser.id);
    }
  }, [chatType, selectedUser, showUserList, currentUser, messages.length]);

  // Pobierz wiadomości
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);
    setMessages([]);

    let q;
    try {
      if (chatType === 'global') {
        q = collection(db, 'messages');
      } else if (chatType === 'important') {
        q = collection(db, 'important_messages');
      } else {
        q = query(
          collection(db, 'direct_messages'),
          where('participants', 'array-contains', currentUser.uid)
        );
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (chatType === 'direct' && selectedUser) {
          data = data.filter(m => m.participants && m.participants.includes(selectedUser.id));
        }

        data.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.localTimestamp || Date.now());
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.localTimestamp || Date.now());
          return tA - tB;
        });

        if (chatType === 'global' && data.length > 100) {
          data = data.slice(-100);
        }

        setMessages(data);
        setLoading(false);
      }, (err) => {
        console.error("Firebase error:", err);
        setError(`Błąd bazy: ${err.code === 'permission-denied' ? 'Brak uprawnień (Security Rules)' : err.message}`);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error("Query setup error:", err);
      setError("Nie udało się uruchomić czatu.");
      setLoading(false);
    }
  }, [selectedUser?.id, currentUser?.uid, chatType]);

  // Auto-scroll do dołu przy nowych wiadomościach
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('Plik jest za duży (max 5MB)');
    
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !currentUser) return;

    const text = newMessage.trim();
    const fileToUpload = selectedFile;
    const localTimestamp = Date.now();
    
    setNewMessage('');
    setSelectedFile(null);
    setImagePreview(null);

    try {
      let imageUrl = null;
      if (fileToUpload) {
        setUploading(true);
        const fileRef = ref(storage, `chats/${chatType === 'direct' ? 'direct' : chatType}/${Date.now()}_${fileToUpload.name}`);
        const uploadResult = await uploadBytes(fileRef, fileToUpload);
        imageUrl = await getDownloadURL(uploadResult.ref);
        setUploading(false);
      }

      const msgData = {
        text,
        imageUrl,
        senderId: currentUser.uid,
        senderName: chatType === 'important' ? 'ETOS' : (currentUser.displayName || 'Użytkownik'),
        avatarUrl: currentUser.avatarUrl || null,
        createdAt: serverTimestamp(),
        localTimestamp
      };

      if (chatType === 'global') {
        await addDoc(collection(db, 'messages'), msgData);
      } else if (chatType === 'important') {
        await addDoc(collection(db, 'important_messages'), { ...msgData, likes: [] });
      } else if (chatType === 'direct') {
        await addDoc(collection(db, 'direct_messages'), {
          ...msgData,
          receiverId: selectedUser.id,
          participants: [currentUser.uid, selectedUser.id].sort()
        });
      }
    } catch (err) {
      console.error('Błąd wysyłania:', err);
      setError("Nie udało się wysłać wiadomości.");
      setUploading(false);
    }
  };

  const currentChatUser = useMemo(() => {
    if (!selectedUser) return null;
    return users.find(u => u.id === selectedUser.id) || selectedUser;
  }, [selectedUser, users]);

  const toggleLike = async (msgId, currentLikes) => {
    if (!currentUser) return;
    try {
      const isLiked = currentLikes?.includes(currentUser.uid);
      const newLikes = isLiked 
        ? currentLikes.filter(id => id !== currentUser.uid)
        : [...(currentLikes || []), currentUser.uid];
      
      await setDoc(doc(db, 'important_messages', msgId), { likes: newLikes }, { merge: true });
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  return (
    <div className="flex h-[calc(100vh-124px)] max-w-4xl mx-auto bg-gray-50 dark:bg-black overflow-hidden relative">
      {/* Sidebar - User List */}
      <div className={clsx(
        "w-full md:w-80 border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-all",
        !showUserList && "hidden md:flex"
      )}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-black text-gray-800 dark:text-gray-100">Czat</h2>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Global Chat Item */}
          <button 
            onClick={() => { setChatType('global'); setSelectedUser(null); setShowUserList(false); }}
            className={clsx(
              "w-full p-4 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition border-b border-gray-100 dark:border-gray-800/50",
              chatType === 'global' && "bg-brand-50 dark:bg-brand-900/10 border-r-4 border-r-brand-600"
            )}
          >
            <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20 shrink-0">
              <Users size={24} />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-gray-800 dark:text-gray-100">Czat Ogólny</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight truncate">Wszyscy pracownicy</p>
            </div>
            {unreadCounts.global > 0 && (
              <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-bounce">
                {unreadCounts.global}
              </span>
            )}
          </button>

          {/* Important Chat Item */}
          <button 
            onClick={() => { setChatType('important'); setSelectedUser(null); setShowUserList(false); }}
            className={clsx(
              "w-full p-4 flex items-center space-x-3 hover:bg-red-50 dark:hover:bg-red-900/10 transition",
              chatType === 'important' && "bg-red-50 dark:bg-red-900/10 border-r-4 border-r-red-500"
            )}
          >
            <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-500/20 shrink-0">
              <AlertCircle size={24} />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-red-600 dark:text-red-400">WAŻNE!</p>
              <p className="text-[10px] text-red-400/80 font-bold uppercase tracking-tight truncate">Ogłoszenia Szefowej</p>
            </div>
            {unreadCounts.important > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                {unreadCounts.important}
              </span>
            )}
          </button>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/20 text-[10px] font-black text-gray-400 uppercase tracking-widest border-t border-gray-100 dark:border-gray-800">
            Wiadomości Prywatne
          </div>

          {users.map(u => (
            <button 
              key={u.id}
              onClick={() => { setChatType('direct'); setSelectedUser(u); setShowUserList(false); }}
              className={clsx(
                "w-full p-4 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition",
                chatType === 'direct' && selectedUser?.id === u.id && "bg-brand-50 dark:bg-brand-900/10 border-r-4 border-brand-600"
              )}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-gray-500 overflow-hidden border border-gray-200 dark:border-gray-700">
                  <User size={20} />
                </div>
                {u.isOnline && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full shadow-sm"></div>
                )}
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-gray-800 dark:text-gray-100">{u.name}</p>
                <p className="text-[10px] text-gray-400">
                  {u.isOnline 
                    ? 'Aktywny(a) teraz' 
                    : u.lastSeen 
                      ? `Ostatnio: ${formatDistanceToNow(u.lastSeen, { addSuffix: true, locale: pl })}`
                      : 'Kliknij, aby napisać'}
                </p>
              </div>
              {unreadCounts.direct[u.id] > 0 && (
                <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {unreadCounts.direct[u.id]}
                </span>
              )}
            </button>
          ))}
          
          {users.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-xs italic">Brak innych użytkowników</div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={clsx(
        "flex-1 flex flex-col bg-white dark:bg-gray-950 transition-all relative",
        showUserList && "hidden md:flex"
      )}>
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center space-x-3 bg-white dark:bg-gray-900 shadow-sm z-10">
          <button onClick={() => setShowUserList(true)} className="md:hidden p-2 -ml-2 text-gray-400 hover:text-brand-600">
            <ChevronLeft size={24} />
          </button>
          <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center font-bold border overflow-hidden",
            chatType === 'important' ? "bg-red-50 text-red-500 border-red-100 dark:bg-red-900/20 dark:border-red-900/30" : "bg-white dark:bg-gray-900 text-brand-600 border-brand-100 dark:border-brand-900/30"
          )}>
            {chatType === 'direct' 
              ? <User size={20} /> 
              : chatType === 'important' ? <AlertCircle size={20} /> : <Users size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 dark:text-gray-100">
              {chatType === 'direct' ? currentChatUser?.name : chatType === 'important' ? 'Ważne Ogłoszenia' : 'Czat Ogólny'}
            </h3>
            <div className="flex items-center space-x-1">
              {chatType !== 'important' && (
                <div className={clsx(
                  "w-2 h-2 rounded-full",
                  (chatType === 'global' || currentChatUser?.isOnline) ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-gray-300"
                )}></div>
              )}
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                {chatType === 'direct' 
                  ? (currentChatUser?.isOnline ? 'Online' : 'Offline') 
                  : chatType === 'important' ? 'Tylko odczyt' : 'Aktywny'}
              </span>
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="absolute top-20 left-4 right-4 z-20 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-3 rounded-xl flex items-center text-red-600 dark:text-red-400 text-xs font-bold animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950 flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Ładowanie...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
               <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center text-gray-300 mb-4 rotate-3">
                 <MessageSquare size={32} />
               </div>
               <p className="font-bold text-gray-800 dark:text-gray-100">Brak wiadomości</p>
               <p className="text-xs text-gray-400 mt-1">Bądź pierwszy i napisz coś!</p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isMe = chatType === 'important' ? false : msg.senderId === currentUser?.uid;
                const showName = chatType !== 'direct' && (idx === 0 || messages[idx-1].senderId !== msg.senderId);

                return (
                  <div key={msg.id || idx} className={clsx("flex animate-in fade-in duration-300", chatType === 'important' ? "w-full justify-center" : isMe ? "flex-row-reverse" : "flex-row")}>
                    {!isMe && chatType !== 'important' && showName ? (
                      <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 flex-shrink-0 mt-auto mr-2 overflow-hidden flex items-center justify-center text-gray-400 border border-gray-200 dark:border-gray-700">
                        <User size={16} />
                      </div>
                    ) : (
                      !isMe && chatType !== 'important' && <div className="w-8 mr-2 flex-shrink-0" />
                    )}
                    <div className={clsx("flex flex-col", chatType === 'important' ? "w-full" : isMe ? "items-end" : "items-start", chatType !== 'important' && "max-w-[85%]")}>
                      {showName && !isMe && chatType !== 'important' && <span className="text-[10px] font-bold text-gray-400 mb-1 ml-1 uppercase">{msg.senderName}</span>}
                      {chatType === 'important' && <span className="text-[11px] font-black text-red-500 mb-1 ml-1 uppercase tracking-widest">{msg.senderName}</span>}
                      <div className={clsx(
                        "px-4 py-2.5 rounded-2xl shadow-sm transition-all relative group",
                        chatType === 'important'
                          ? "bg-red-50 dark:bg-red-900/10 text-red-900 dark:text-red-100 border-2 border-red-200 dark:border-red-900/30 w-full"
                          : isMe 
                            ? "bg-brand-600 text-white rounded-tr-none" 
                            : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-none border border-gray-100 dark:border-gray-700"
                      )}>
                        {msg.imageUrl && (
                          <div className="mb-2 rounded-lg overflow-hidden border border-black/5 dark:border-white/5">
                            <img 
                              src={msg.imageUrl} 
                              alt="Przesłany obraz" 
                              className="max-w-full h-auto object-cover cursor-pointer hover:scale-[1.02] transition-transform"
                              onClick={() => window.open(msg.imageUrl, '_blank')}
                            />
                          </div>
                        )}
                        <div className={clsx(
                          chatType === 'important' ? "text-lg font-bold leading-tight" : "text-sm"
                        )}>
                          {msg.text}
                        </div>
                        {!msg.createdAt && (
                          <div className="absolute -left-6 bottom-1 opacity-50">
                            <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center mt-1 px-1 space-x-2">
                      <span className="text-[9px] text-gray-400">
                        {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : 'Wysyłanie...'}
                      </span>
                      {chatType === 'important' && (
                        <button 
                          onClick={() => toggleLike(msg.id, msg.likes)}
                          className={clsx(
                            "flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors",
                            msg.likes?.includes(currentUser?.uid) ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                          )}
                        >
                          <span>❤️</span>
                          <span>{msg.likes?.length || 0}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
              <div ref={scrollRef} className="h-2" />
            </>
          )}
        </div>

        {/* Input */}
        {imagePreview && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center">
            <div className="relative">
              <img src={imagePreview} className="w-16 h-16 object-cover rounded-xl border-2 border-brand-500 shadow-md" alt="Preview" />
              <button 
                onClick={() => { setImagePreview(null); setSelectedFile(null); }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"
              >
                <X size={12} />
              </button>
            </div>
            <div className="ml-3">
              <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Podgląd zdjęcia</p>
              <p className="text-[10px] text-gray-400">Zostanie wysłane z wiadomością</p>
            </div>
          </div>
        )}

        {chatType === 'important' && userRole !== 'admin' ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 text-center pb-safe">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Tylko szefowa może dodawać ogłoszenia</p>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center space-x-2 pb-safe">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileSelect}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-brand-600 p-2 transition-colors active:scale-90"
            >
              <Camera size={24} />
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={chatType === 'direct' ? `Napisz do ${currentChatUser?.name || '...'}` : chatType === 'important' ? "Dodaj ważne ogłoszenie..." : "Napisz na czacie ogólnym..."}
              className="flex-1 bg-gray-100 dark:bg-gray-800 border-none rounded-2xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white placeholder-gray-400"
            />
            <button 
              type="submit" 
              className="bg-brand-600 text-white p-3.5 rounded-2xl shadow-lg hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center" 
              disabled={(!newMessage.trim() && !selectedFile) || uploading}
            >
              {uploading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Send size={20} />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
