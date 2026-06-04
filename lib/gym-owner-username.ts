/**
 * Canonical username rules for gym owner portal login and credential generation.
 * Keep frontend and backend in sync by importing from this module.
 */

/** Strip invisible / non-standard whitespace often introduced by copy-paste. */
export function stripInvisibleUsernameChars(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u202A-\u202E]/g, '');
}

/** Normalize username for login lookup (never log passwords with this). */
export function normalizeGymOwnerUsername(value: string): string {
  return stripInvisibleUsernameChars(value)
    .trim()
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Build the canonical username stored for a gym owner. */
export function buildGymOwnerUsername(gymId: string, gymName: string): string {
  const sanitizedName = gymName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 20);
  const suffix = gymId.substring(0, 6);
  return `${sanitizedName}_${suffix}`;
}

/** Sanitize password input — trim/invisible chars only (never change letters or case). */
export function sanitizeGymOwnerPassword(value: string): string {
  return stripInvisibleUsernameChars(value).trim();
}

/** Default password pattern shown to admins (matches username gym-id suffix + 2 chars). */
export function buildGymOwnerDefaultPassword(gymId: string): string {
  return `gym_${gymId.substring(0, 8)}`;
}

/** Shorter form some owners type from the username suffix (first 6 chars of gym id). */
export function buildGymOwnerShortPassword(gymId: string): string {
  return `gym_${gymId.substring(0, 6)}`;
}

export function usernamesMatchForLogin(stored: string, submitted: string): boolean {
  return normalizeGymOwnerUsername(stored) === normalizeGymOwnerUsername(submitted);
}
