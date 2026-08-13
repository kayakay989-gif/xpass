import admin from '@/backend/lib/firebase-admin';
import type { User } from '@/types';

export function resolveUserPhotoUrl(
  user?: Pick<User, 'photoUrl'> | null,
  authPhotoUrl?: string | null
): string {
  const stored = typeof user?.photoUrl === 'string' ? user.photoUrl.trim() : '';
  if (stored) return stored;
  const auth = typeof authPhotoUrl === 'string' ? authPhotoUrl.trim() : '';
  return auth;
}

export async function getAuthPhotoUrls(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (uid) => {
      try {
        const record = await admin.auth().getUser(uid);
        if (record.photoURL?.trim()) {
          map.set(uid, record.photoURL.trim());
        }
      } catch {
        // User may exist only in Firestore (e.g. legacy data).
      }
    })
  );

  return map;
}
