import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyCZO1GkWZwMmD_fbXDv55G5qSieDVbJIzY",
  authDomain: "etos-grafik.firebaseapp.com",
  projectId: "etos-grafik",
  storageBucket: "etos-grafik.firebasestorage.app",
  messagingSenderId: "674317937125",
  appId: "1:674317937125:web:2f30db688d68a6a241270c",
  measurementId: "G-LF8LJNMCDV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize Firestore with Persistence (Cache)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
