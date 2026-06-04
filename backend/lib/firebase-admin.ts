import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function loadServiceAccountFromFile(): admin.ServiceAccount | null {
  const cwd = process.cwd();
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(cwd, 'backend', 'service-account-key.json'),
    path.join(cwd, 'service-account-key.json'),
    ...[cwd, path.join(cwd, 'backend')]
      .flatMap((dir) => {
        try {
          return fs
            .readdirSync(dir)
            .filter((name) => name.includes('firebase-adminsdk') && name.endsWith('.json'))
            .map((name) => path.join(dir, name));
        } catch {
          return [];
        }
      }),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as admin.ServiceAccount;
    } catch {
      // try next path
    }
  }
  return null;
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Production: FIREBASE_SERVICE_ACCOUNT (JSON string on Render, etc.)
    // Local dev: backend/service-account-key.json (download from Firebase Console)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    const serviceAccountFromFile = loadServiceAccountFromFile();

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT');
    } else if (serviceAccountFromFile) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountFromFile),
      });
      console.log('[Firebase Admin] Initialized from service account key file');
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('[Firebase Admin] Initialized from application default credentials');
    }
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization error:', error.message);
    throw error;
  }
}

export const adminDb = admin.firestore();
export default admin;

