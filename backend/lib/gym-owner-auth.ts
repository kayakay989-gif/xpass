import crypto from 'crypto';
import { adminDb } from './firebase-admin';
import admin from 'firebase-admin';

export type GymOwnerSession = {
  ownerId: string;
  gymId: string;
  expiresAt: Date;
};

const SESSION_COLLECTION = 'gymOwnerSessions';

function getSecret(): string {
  const secret = process.env['GYM_OWNER_SESSION_SECRET'];
  if (!secret) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('Missing GYM_OWNER_SESSION_SECRET');
    }
    // dev fallback (still deterministic per process)
    return 'dev-secret';
  }
  return secret;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(`${token}:${getSecret()}`).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createGymOwnerSession(params: {
  ownerId: string;
  gymId: string;
  ttlHours?: number;
}): Promise<{ token: string; session: GymOwnerSession }> {
  const ttlHours = params.ttlHours ?? 24 * 7; // 7 days
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await adminDb.collection(SESSION_COLLECTION).doc(tokenHash).set({
    ownerId: params.ownerId,
    gymId: params.gymId,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    token,
    session: { ownerId: params.ownerId, gymId: params.gymId, expiresAt },
  };
}

export async function getGymOwnerSessionByToken(token: string): Promise<GymOwnerSession | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const snap = await adminDb.collection(SESSION_COLLECTION).doc(tokenHash).get();
  if (!snap.exists) return null;
  const data: any = snap.data();
  if (!data) return null;
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(0);
  if (expiresAt.getTime() < Date.now()) return null;
  return { ownerId: data.ownerId, gymId: data.gymId, expiresAt };
}

