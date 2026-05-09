import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

export function useChat() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }) {
  const { currentUser } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState({ global: 0, important: 0, direct: {} });
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setUnreadCounts({ global: 0, important: 0, direct: {} });
      setTotalUnread(0);
      return;
    }

    const getReadTime = (key) => parseInt(localStorage.getItem(`lastRead_${key}`) || '0', 10);

    const unsubGlobal = onSnapshot(collection(db, 'messages'), (snapshot) => {
      const readTime = getReadTime('global');
      let count = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.senderId !== currentUser.uid) {
          const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || 0);
          if (msgTime > readTime) count++;
        }
      });
      setUnreadCounts(prev => ({ ...prev, global: count }));
    });

    const unsubImportant = onSnapshot(collection(db, 'important_messages'), (snapshot) => {
      const readTime = getReadTime('important');
      let count = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.senderId !== currentUser.uid) {
          const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || 0);
          if (msgTime > readTime) count++;
        }
      });
      setUnreadCounts(prev => ({ ...prev, important: count }));
    });

    const unsubDirect = onSnapshot(
      query(collection(db, 'direct_messages'), where('participants', 'array-contains', currentUser.uid)),
      (snapshot) => {
        const counts = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.senderId !== currentUser.uid) {
            const readTime = getReadTime(`direct_${data.senderId}`);
            const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || 0);
            if (msgTime > readTime) {
              counts[data.senderId] = (counts[data.senderId] || 0) + 1;
            }
          }
        });
        setUnreadCounts(prev => ({ ...prev, direct: counts }));
      }
    );

    return () => {
      unsubGlobal();
      unsubImportant();
      unsubDirect();
    };
  }, [currentUser]);

  useEffect(() => {
    const directTotal = Object.values(unreadCounts.direct).reduce((a, b) => a + b, 0);
    setTotalUnread(unreadCounts.global + unreadCounts.important + directTotal);
  }, [unreadCounts]);

  // Funkcja do oznaczania jako przeczytane
  const markAsRead = (type, targetId = null) => {
    const now = Date.now();
    const key = type === 'direct' ? `direct_${targetId}` : type;
    localStorage.setItem(`lastRead_${key}`, now.toString());
    
    // Ręczna aktualizacja stanu, aby UI zareagował natychmiast
    setUnreadCounts(prev => {
      if (type === 'direct' && targetId) {
        const newDirect = { ...prev.direct };
        delete newDirect[targetId];
        return { ...prev, direct: newDirect };
      }
      return { ...prev, [type]: 0 };
    });

    // Powiadom inne komponenty (np. Layout)
    window.dispatchEvent(new CustomEvent('chat_read_update', { 
      detail: { key, timestamp: now } 
    }));
  };

  return (
    <ChatContext.Provider value={{ unreadCounts, totalUnread, markAsRead }}>
      {children}
    </ChatContext.Provider>
  );
}
