import { verifyPassword } from '@/backend/lib/password';
import type { GymOwner } from '@/types';
import {
  buildGymOwnerDefaultPassword,
  buildGymOwnerShortPassword,
  sanitizeGymOwnerPassword,
} from '@/lib/gym-owner-username';

/**
 * Verify gym owner password against a stored hash.
 * Typed and pasted input are treated identically (trim + invisible character strip only).
 * Also accepts the short gym_{6} form when it matches the username suffix and the stored hash is gym_{8}.
 */
export function verifyGymOwnerPassword(
  gymId: string,
  submittedPassword: string,
  storedHash: string
): boolean {
  const password = sanitizeGymOwnerPassword(submittedPassword);
  if (!password || !storedHash) return false;

  if (verifyPassword(password, storedHash)) {
    return true;
  }

  const canonical = buildGymOwnerDefaultPassword(gymId);
  const shortForm = buildGymOwnerShortPassword(gymId);

  // Common mistake: typing gym_ae500b from username instead of gym_ae500b5d
  if (password === shortForm && canonical.startsWith(shortForm)) {
    return verifyPassword(canonical, storedHash);
  }

  return false;
}

/**
 * Verify credentials for a gym owner record.
 * Tries passwordHash first, then legacy plaintext (for partially migrated records).
 */
export function verifyGymOwnerCredentials(
  owner: Pick<GymOwner, 'gymId' | 'password' | 'passwordHash'>,
  submittedPassword: string
): boolean {
  const password = sanitizeGymOwnerPassword(submittedPassword);
  if (!password) return false;

  const hasHash = typeof owner.passwordHash === 'string' && owner.passwordHash.length > 0;
  if (hasHash && verifyGymOwnerPassword(owner.gymId, password, owner.passwordHash!)) {
    return true;
  }

  const legacyPlain =
    typeof owner.password === 'string' ? sanitizeGymOwnerPassword(owner.password) : '';
  if (legacyPlain && legacyPlain === password) {
    return true;
  }

  return false;
}
