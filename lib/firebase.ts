import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration (production-ready: set via EXPO_PUBLIC_* env vars)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "REPLACE_ME",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "REPLACE_ME",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "REPLACE_ME",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "REPLACE_ME",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "REPLACE_ME",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "REPLACE_ME",
};

// Initialize Firebase (prevent multiple initializations)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

const isReactNative = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    return !!rn && rn.Platform?.OS !== 'web';
  } catch {
    return false;
  }
};

const initAuth = (firebaseApp: FirebaseApp): Auth => {
  // On React Native, provide AsyncStorage to persist auth sessions.
  // On web / server contexts, fall back to getAuth().
  if (!isReactNative()) {
    return getAuth(firebaseApp);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage')?.default
      ?? require('@react-native-async-storage/async-storage');
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // If Auth was already initialized or AsyncStorage is unavailable, fall back gracefully.
    return getAuth(firebaseApp);
  }
};

try {
  // Check if Firebase is already initialized
  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
  } else {
    app = initializeApp(firebaseConfig);
  }

  // Initialize Auth with RN persistence when available
  auth = initAuth(app);

  // Initialize Firestore
  db = getFirestore(app);

  // no noisy logs in production
} catch (error) {
  console.error('[Firebase] Initialization error:', error);
  // Create fallback instances to prevent app crashes
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  if (!auth) {
    auth = initAuth(app);
  }
  if (!db) {
    db = getFirestore(app);
  }
}

export { auth, db, app };
export default app;

