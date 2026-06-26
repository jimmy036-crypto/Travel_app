import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const initFirebase = () => {
  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
    console.warn("Firebase 環境變數不完整。");
    return { db: null, storage: null };
  }

  try {
    const firebaseApp =
      getApps().length === 0
        ? initializeApp(firebaseConfig)
        : getApp();

    return {
      db: getDatabase(firebaseApp),
      storage: getStorage(firebaseApp),
    };
  } catch (error) {
    console.warn("Firebase 初始化失敗：", error);
    return { db: null, storage: null };
  }
};

export const { db, storage } = initFirebase();