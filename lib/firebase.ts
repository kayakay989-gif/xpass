import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const env =
  typeof process !== 'undefined' && process.env ? (process.env as any) : ({} as Record<string, any>);

const dev =
  typeof (globalThis as any).__DEV__ !== 'undefined'
    ? (globalThis as any).__DEV__
    : env.NODE_ENV !== 'production';

// Firebase configuration (production-ready: set via EXPO_PUBLIC_* env vars)
const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || "REPLACE_ME",
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "REPLACE_ME",
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "REPLACE_ME",
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "REPLACE_ME",
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "REPLACE_ME",
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || "REPLACE_ME",
};

// Public Firebase web config is safe to ship in clients and prevents launch crashes
// when EXPO_PUBLIC_* variables are missing from a remote build environment.
const firebaseFallbackConfig = {
  apiKey: "AIzaSyAlqwncSNNmfef5r1VoR50DiOf6A6J0E5Q",
  authDomain: "xpass-rork-1e6ad.firebaseapp.com",
  projectId: "xpass-rork-1e6ad",
  storageBucket: "xpass-rork-1e6ad.firebasestorage.app",
  messagingSenderId: "40764236173",
  appId: "1:40764236173:web:0058661044890ff9de1dc4",
};

const hasMissingFirebaseKeys = Object.values(firebaseConfig).some((v) => !v || v === 'REPLACE_ME');
const resolvedFirebaseConfig = hasMissingFirebaseKeys ? firebaseFallbackConfig : firebaseConfig;

// Never allow shipping a production web build with REPLACE_ME fallbacks.
// (On web, process.env is inlined at build time; if it wasn't injected, values will stay "REPLACE_ME".)
if (!dev) {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, v]) => !v || v === 'REPLACE_ME')
    .map(([k]) => k);
  if (missingKeys.length > 0) {
    // IMPORTANT: App Store review rejects apps that crash on launch.
    // In some review/build environments, your EXPO_PUBLIC_* env vars might not be injected,
    // so we must not throw during module import-time. The app can still boot and show UI;
    // Firebase-dependent features will fail until keys are correctly configured.
    console.warn(
      `[Firebase] Missing Firebase env configuration for: ${missingKeys.join(
        ', '
      )}. Falling back to built-in Firebase config for launch safety.`
    );
  }
}

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
    // Metro resolves RN entry; types live on @firebase/auth (not exported from firebase/auth for web).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getReactNativePersistence } = require('@firebase/auth');
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
    app = initializeApp(resolvedFirebaseConfig);
  }

  // Initialize Auth with RN persistence when available
  auth = initAuth(app);

  // Initialize Firestore
  db = getFirestore(app);

  // no noisy logs in production
} catch (error) {
  console.error('[Firebase] Initialization error:', error);
  // Last-resort fallback to avoid launch-time crashes.
  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    auth = initAuth(app);
    db = getFirestore(app);
  } else {
    app = initializeApp(firebaseFallbackConfig);
    auth = initAuth(app);
    db = getFirestore(app);
  }
}

export { auth, db, app };
export default app;

