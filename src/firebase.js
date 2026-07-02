import { initializeApp, getApps, getApp } from "firebase/app";
import {
  connectDatabaseEmulator,
  getDatabase,
} from "firebase/database";
import {
  connectStorageEmulator,
  getStorage,
} from "firebase/storage";

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

const shouldUseEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

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

    const db = getDatabase(firebaseApp);
    const storage = getStorage(firebaseApp);

    // 只有明確使用 emulator mode 時才連到本機，
    // 避免正式 Vercel 網站誤連 127.0.0.1。
    if (
      shouldUseEmulators &&
      !globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__
    ) {
      connectDatabaseEmulator(db, "127.0.0.1", 9000);
      connectStorageEmulator(storage, "127.0.0.1", 9199);

      globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__ = true;

      console.info(
        "Firebase Emulator 已連線：Database 9000、Storage 9199",
      );
    }

    return { db, storage };
  } catch (error) {
    console.warn("Firebase 初始化失敗：", error);
    return { db: null, storage: null };
  }
};

export const { db, storage } = initFirebase();
