import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Production-safe initialization:
    // - Prefer FIREBASE_SERVICE_ACCOUNT (JSON string) for most deployments.
    // - Fall back to Application Default Credentials when running on GCP.
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Firebase Admin] Initialized from FIREBASE_SERVICE_ACCOUNT');
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

