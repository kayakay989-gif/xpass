import admin, { adminDb } from '@/backend/lib/firebase-admin';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { hashPassword, verifyPassword } from '@/backend/lib/password';
import {
  buildGymOwnerDefaultPassword,
  buildGymOwnerUsername,
  normalizeGymOwnerUsername,
} from '@/lib/gym-owner-username';

export type CanonicalCredentialsResult = {
  ownerId: string;
  gymId: string;
  username: string;
  password: string;
  passwordUpdated: boolean;
  usernameUpdated: boolean;
};

/**
 * Ensure gym owner can log in with credentials shown in admin panel.
 * Updates password hash to canonical gym_{first8(gymId)}; keeps or fixes username.
 */
export async function applyCanonicalGymOwnerCredentials(
  ownerId: string,
  gymId: string,
  gymName: string,
  existingUsername?: string
): Promise<CanonicalCredentialsResult> {
  const password = buildGymOwnerDefaultPassword(gymId);
  const expectedUsername = buildGymOwnerUsername(gymId, gymName);
  const username =
    existingUsername && normalizeGymOwnerUsername(existingUsername).length > 0
      ? normalizeGymOwnerUsername(existingUsername)
      : expectedUsername;

  await adminDb.collection('gymOwners').doc(ownerId).set(
    {
      gymId,
      username,
      usernameNormalized: normalizeGymOwnerUsername(username),
      passwordHash: hashPassword(password),
      password: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  return {
    ownerId,
    gymId,
    username,
    password,
    passwordUpdated: true,
    usernameUpdated: existingUsername !== username,
  };
}

export async function syncGymOwnerPasswordForGym(gymId: string): Promise<CanonicalCredentialsResult | null> {
  const gym = await firestoreGyms.getById(gymId);
  if (!gym) return null;

  let owner = await firestoreGymOwners.getByGymId(gymId);
  if (!owner) return null;

  const password = buildGymOwnerDefaultPassword(gymId);
  const passwordOk =
    owner.passwordHash && verifyPassword(password, owner.passwordHash);

  if (passwordOk && owner.usernameNormalized) {
    return {
      ownerId: owner.id,
      gymId,
      username: owner.username,
      password,
      passwordUpdated: false,
      usernameUpdated: false,
    };
  }

  return applyCanonicalGymOwnerCredentials(owner.id, gymId, gym.name, owner.username);
}
