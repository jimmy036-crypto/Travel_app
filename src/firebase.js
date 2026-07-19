import { initializeApp, getApps, getApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";
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

const requiredFirebaseConfigKeys = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

if (typeof document !== "undefined") {
  document.documentElement.dataset.firebaseEmulator =
    shouldUseEmulators ? "true" : "false";
}

const initFirebase = () => {
  const missingConfigKeys = requiredFirebaseConfigKeys.filter(
    (key) => !firebaseConfig[key],
  );

  if (missingConfigKeys.length > 0) {
    console.warn(
      "Firebase config is incomplete.",
      { missingConfigKeys },
    );
    return { auth: null, db: null, storage: null };
  }

  try {
    const firebaseApp =
      getApps().length === 0
        ? initializeApp(firebaseConfig)
        : getApp();

    const auth = getAuth(firebaseApp);
    const db = getDatabase(firebaseApp);
    const storage = getStorage(firebaseApp);

    if (
      shouldUseEmulators &&
      !globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__
    ) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectDatabaseEmulator(db, "127.0.0.1", 9000);
      connectStorageEmulator(storage, "127.0.0.1", 9199);

      globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__ = true;

      console.info(
        "Firebase Emulators connected: Auth 9099, Database 9000, Storage 9199.",
      );
    }

    return { auth, db, storage };
  } catch (error) {
    console.warn("Firebase initialization failed.", error);
    return { auth: null, db: null, storage: null };
  }
};

export const { auth, db, storage } = initFirebase();
