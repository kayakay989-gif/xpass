import admin from '@/backend/lib/firebase-admin';
import { firestoreUsers } from '@/backend/lib/firestore-admin';
import type { User } from '@/types';
import {
  isValidMemberName,
  looksLikeProviderReference,
  normalizeMemberName,
  resolveMemberDisplayName,
} from '@/lib/profile-validation';

export type AdminEnrichedUser = User & {
  authDisplayName?: string | null;
  signInProvider?: string | null;
  signInProviderLabel?: string;
};

function resolveSignInProvider(userRecord: admin.auth.UserRecord): string | undefined {
  const primary = userRecord.providerData?.[0]?.providerId;
  if (!primary) return undefined;
  if (primary.includes('google')) return 'google';
  if (primary.includes('apple')) return 'apple';
  if (primary === 'password') return 'email';
  return primary;
}

export function signInProviderLabel(provider?: string | null): string {
  if (provider === 'google') return 'Google';
  if (provider === 'apple') return 'Apple';
  if (provider === 'email' || provider === 'password') return 'Email';
  if (!provider) return 'Unknown';
  return provider;
}

async function listAllAuthUsers(): Promise<Map<string, admin.auth.UserRecord>> {
  const map = new Map<string, admin.auth.UserRecord>();
  let pageToken: string | undefined;

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const record of page.users) {
      map.set(record.uid, record);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return map;
}

function mergeUserWithAuthRecord(
  firestoreUser: User,
  authUser?: admin.auth.UserRecord
): AdminEnrichedUser {
  if (!authUser) {
    const cleanedName = resolveMemberDisplayName(firestoreUser.name, null);
    return {
      ...firestoreUser,
      name: cleanedName || (looksLikeProviderReference(firestoreUser.name) ? '' : firestoreUser.name),
      signInProvider: firestoreUser.authProvider || null,
      signInProviderLabel: signInProviderLabel(firestoreUser.authProvider),
    };
  }

  const signInProvider = resolveSignInProvider(authUser) || firestoreUser.authProvider || null;
  const authDisplayName = normalizeMemberName(authUser.displayName || '');
  const authEmail = (authUser.email || '').trim().toLowerCase();
  const authPhone = authUser.phoneNumber || '';

  const resolvedName = resolveMemberDisplayName(firestoreUser.name, authDisplayName);
  const resolvedEmail = (firestoreUser.email || authEmail || '').trim().toLowerCase();
  const resolvedPhone = firestoreUser.phone || authPhone || '';
  const resolvedPhoto =
    (typeof firestoreUser.photoUrl === 'string' && firestoreUser.photoUrl.trim()) ||
    authUser.photoURL ||
    undefined;

  return {
    ...firestoreUser,
    name: resolvedName || '',
    email: resolvedEmail,
    phone: resolvedPhone,
    photoUrl: resolvedPhoto,
    authProvider: signInProvider || firestoreUser.authProvider,
    authDisplayName: authDisplayName || null,
    signInProvider,
    signInProviderLabel: signInProviderLabel(signInProvider),
  };
}

/** Backfill Firestore when Firebase Auth has a real name/email missing from the profile doc. */
async function backfillFirestoreProfile(enriched: AdminEnrichedUser): Promise<void> {
  const patch: Partial<User> = {};

  const existingName = normalizeMemberName(enriched.name || '');
  if (existingName && isValidMemberName(existingName)) {
    patch.name = existingName;
  }

  if (enriched.email?.trim()) patch.email = enriched.email.trim().toLowerCase();
  if (enriched.phone?.trim()) patch.phone = enriched.phone.trim();
  if (enriched.authProvider) patch.authProvider = enriched.authProvider;
  if (enriched.photoUrl?.trim()) patch.photoUrl = enriched.photoUrl.trim();

  if (Object.keys(patch).length === 0) return;

  try {
    await firestoreUsers.update(enriched.id, patch);
  } catch (error) {
    console.warn('[Admin] Failed to backfill user profile from Auth:', enriched.id, error);
  }
}

export async function enrichUsersForAdmin(users: User[]): Promise<AdminEnrichedUser[]> {
  const authByUid = await listAllAuthUsers();

  const enriched = users.map((user) => mergeUserWithAuthRecord(user, authByUid.get(user.id)));

  // Best-effort backfill for OAuth users stored with empty/invalid names.
  await Promise.all(
    enriched.map(async (user) => {
      const firestoreNameInvalid =
        !user.name?.trim() ||
        looksLikeProviderReference(user.name) ||
        !isValidMemberName(user.name);
      if (firestoreNameInvalid && user.authDisplayName && isValidMemberName(user.authDisplayName)) {
        await backfillFirestoreProfile(user);
      }
    })
  );

  return enriched;
}
