import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// Wyłączamy tryb mockowania
const MOCK_MODE = false;

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        
        // Nasłuchiwanie na zmiany dokumentu użytkownika
        unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserRole(data.role);
            setCurrentUser({
              ...user,
              displayName: `${data.firstName || ''} ${data.lastName || ''}`.trim() || user.displayName || user.email.split('@')[0],
              avatarUrl: data.avatarUrl || null
            });
          } else {
            setUserRole('employee');
            setCurrentUser(user);
          }
          setLoading(false);
        }, (err) => {
          console.error("User doc snapshot error:", err);
          setUserRole('employee');
          setCurrentUser(user);
          setLoading(false);
        });

        // Update lastSeen on login
        await updateDoc(userDocRef, { lastSeen: serverTimestamp() }).catch(() => {});
      } else {
        if (unsubscribeDoc) unsubscribeDoc();
        setUserRole(null);
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  // Heartbeat to keep user "online"
  useEffect(() => {
    if (!currentUser) return;

    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          lastSeen: serverTimestamp()
        });
      } catch (err) {
        console.warn('Presence update failed:', err);
      }
    };

    const interval = setInterval(updatePresence, 10 * 60 * 1000); // co 10 minut
    updatePresence(); // od razu na start

    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return firebaseSignOut(auth);
  }

  const value = {
    currentUser,
    userRole,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
