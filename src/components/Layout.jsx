import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Calendar, User, ArrowRightLeft, Clock, Users, MessageSquare, ClipboardList, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import clsx from 'clsx';

import { useChat } from '../contexts/ChatContext';

export default function Layout() {
  const { userRole, currentUser } = useAuth();
  const { totalUnread } = useChat();
  const [pendingRequests, setPendingRequests] = useState(0);
  const location = useLocation();
  
  // Współdzielony stan daty nawigacji dla Grafiku i Profilu (CSV)
  const [scheduleDate, setScheduleDate] = useState(new Date());

  useEffect(() => {
    // Nasłuchuj na prośby o zamianę tylko dla Szefowej
    if (userRole === 'admin') {
      const q = query(collection(db, 'swap_requests'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let count = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.status === 'pending' || data.status === 'exchange_taken') {
            count++;
          }
        });
        setPendingRequests(count);
      }, (error) => {
        console.warn('Firebase query error:', error.message);
      });
      return () => unsubscribe();
    }
  }, [userRole]);

  // Tylko notyfikacje przeglądarkowe pozostają w Layout (lub mogą być w osobnym hooku)
  useEffect(() => {
    if (!currentUser) return;

    const unsubGlobal = onSnapshot(collection(db, 'messages'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const readTime = parseInt(localStorage.getItem('lastRead_global') || '0', 10);
          if (data.senderId !== currentUser.uid) {
            const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || Date.now());
            if (msgTime > readTime && window.location.pathname !== '/chat') {
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                new Notification("Nowa wiadomość (Czat Ogólny)", { 
                  body: `${data.senderName || 'Ktoś'}: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`, 
                  icon: "/vite.svg" 
                });
              }
            }
          }
        }
      });
    });

    const unsubDirect = onSnapshot(
      query(collection(db, 'direct_messages'), where('participants', 'array-contains', currentUser.uid)), 
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.senderId !== currentUser.uid) {
              const readTime = parseInt(localStorage.getItem(`lastRead_direct_${data.senderId}`) || '0', 10);
              const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || Date.now());
              
              if (msgTime > readTime && window.location.pathname !== '/chat') {
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                  new Notification(`Wiadomość od: ${data.senderName || 'Użytkownik'}`, { 
                    body: data.text.substring(0, 50) + (data.text.length > 50 ? '...' : ''), 
                    icon: "/vite.svg" 
                  });
                }
              }
            }
          }
        });
      }
    );

    const unsubImportant = onSnapshot(collection(db, 'important_messages'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.senderId !== currentUser.uid) {
            const readTime = parseInt(localStorage.getItem('lastRead_important') || '0', 10);
            const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.localTimestamp || Date.now());
            if (msgTime > readTime && window.location.pathname !== '/chat') {
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                new Notification("WAŻNE OGŁOSZENIE!", { 
                  body: data.text.substring(0, 50) + (data.text.length > 50 ? '...' : ''), 
                  icon: "/vite.svg" 
                });
              }
            }
          }
        }
      });
    });

    return () => {
      unsubGlobal();
      unsubDirect();
      unsubImportant();
    };
  }, [currentUser]);

  const navItems = [
    { to: "/", icon: Calendar, label: "Grafik" },
    { to: "/my-shifts", icon: Clock, label: "Moje Zmiany" },
    { to: "/chat", icon: MessageSquare, label: "Czat", badge: totalUnread > 0 ? totalUnread : false },
    { to: "/profile", icon: Menu, label: "Menu" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950 pb-16">
      {/* Top Header - Teraz na sztywno FIXED */}
      <header className="fixed top-0 left-0 right-0 h-[60px] bg-brand-600 text-white p-4 shadow-md z-50 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img src="/icon.png" alt="Logo" className="w-8 h-8 rounded-lg border border-white/20" />
          <h1 className="text-xl font-bold">ETOS | Grafik</h1>
        </div>
        <div className="text-xs bg-brand-700 px-2 py-1 rounded-full">{userRole === 'admin' ? 'Szefowa' : 'Pracownik'}</div>
      </header>

      {/* Main Content Area - Z marginesem pod fixed header */}
      <main className="flex-1 overflow-y-auto mt-[60px]">
        <Outlet context={{ scheduleDate, setScheduleDate }} />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20 pb-safe">
        <ul className="flex justify-around items-center h-16 relative">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    "relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors duration-200",
                    isActive ? "text-brand-600" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  )
                }
              >
                <div className="relative">
                  <item.icon size={24} strokeWidth={2.5} />
                  {item.badge && (
                    <span className="absolute -top-2 -right-2 flex items-center justify-center h-4 min-w-[16px] px-1 bg-red-500 rounded-full text-[9px] text-white font-bold border border-white dark:border-gray-900 z-10">
                      {typeof item.badge === 'number' ? item.badge : ''}
                      <span className="animate-ping absolute top-0 left-0 h-full w-full rounded-full bg-red-400 opacity-75 -z-10"></span>
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
