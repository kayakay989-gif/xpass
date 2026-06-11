import { firestoreGymOwners } from '@/backend/lib/firestore-admin';
import { verifyGymOwnerCredentials } from '@/backend/lib/gym-owner-password';
import type { GymOwner } from '@/types';
import {
  normalizeGymOwnerUsername,
  sanitizeGymOwnerPassword,
  sanitizeGymOwnerUsernameInput,
} from '@/lib/gym-owner-username';

export type GymOwnerLoginResolveResult = {
  owner: GymOwner | null;
  lookupMethod: string;
  candidateCount: number;
  normalizedUsername: string;
  reason?: 'empty_credentials' | 'user_not_found' | 'password_mismatch';
  matchedOwnerId?: string;
};

/**
 * Resolve gym owner for login using normalized username lookup and password disambiguation.
 * When duplicate username records exist, every candidate is checked so the wrong Firestore
 * document order can never cause intermittent password failures.
 */
export async function resolveGymOwnerForLogin(
  rawUsername: string,
  rawPassword: string
): Promise<GymOwnerLoginResolveResult> {
  const sanitizedUsername = sanitizeGymOwnerUsernameInput(rawUsername);
  const password = sanitizeGymOwnerPassword(rawPassword);
  const normalizedUsername = normalizeGymOwnerUsername(sanitizedUsername);

  if (!normalizedUsername || !password) {
    return {
      owner: null,
      lookupMethod: 'empty',
      candidateCount: 0,
      normalizedUsername,
      reason: 'empty_credentials',
    };
  }

  const lookup = await firestoreGymOwners.findAllByLoginUsername(sanitizedUsername);

  if (lookup.owners.length === 0) {
    return {
      owner: null,
      lookupMethod: lookup.lookupMethod,
      candidateCount: 0,
      normalizedUsername,
      reason: 'user_not_found',
    };
  }

  if (lookup.owners.length > 1) {
    console.warn('[GymOwnerAuth] Duplicate login candidates', {
      normalizedUsername,
      count: lookup.owners.length,
      ownerIds: lookup.owners.map((o) => o.id),
      lookupMethod: lookup.lookupMethod,
    });
  }

  for (const candidate of lookup.owners) {
    if (verifyGymOwnerCredentials(candidate, password)) {
      return {
        owner: candidate,
        lookupMethod: lookup.lookupMethod,
        candidateCount: lookup.owners.length,
        normalizedUsername,
        matchedOwnerId: candidate.id,
      };
    }
  }

  return {
    owner: null,
    lookupMethod: lookup.lookupMethod,
    candidateCount: lookup.owners.length,
    normalizedUsername,
    reason: 'password_mismatch',
  };
}
