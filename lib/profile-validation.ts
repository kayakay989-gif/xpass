/** Minimum age to register for Xpass membership. */
export const MIN_MEMBER_AGE = 18;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Firebase UIDs / provider subject IDs — never show as a person's name. */
export function looksLikeProviderReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('@')) return false;
  if (trimmed.includes(' ')) return false;
  return /^[a-zA-Z0-9._-]{16,}$/.test(trimmed);
}

export function isValidMemberEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

export function isValidMemberAge(age: number): boolean {
  return Number.isInteger(age) && age >= MIN_MEMBER_AGE && age <= 150;
}

export function normalizeMemberName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function isValidMemberName(name: string): boolean {
  const normalized = normalizeMemberName(name);
  return normalized.length >= 2 && !looksLikeProviderReference(normalized);
}

export function resolveMemberDisplayName(
  profileName?: string | null,
  authDisplayName?: string | null
): string {
  const fromProfile = normalizeMemberName(profileName || '');
  if (fromProfile && isValidMemberName(fromProfile)) return fromProfile;
  const fromAuth = normalizeMemberName(authDisplayName || '');
  if (fromAuth && isValidMemberName(fromAuth)) return fromAuth;
  return '';
}

export function isMemberProfileComplete(
  profile: { name?: string | null; email?: string | null; age?: number | null } | null | undefined,
  authEmail?: string | null,
  authDisplayName?: string | null
): boolean {
  const name = resolveMemberDisplayName(profile?.name, authDisplayName);
  const email = (profile?.email || authEmail || '').trim().toLowerCase();
  const age = profile?.age;

  if (!isValidMemberName(name)) return false;
  if (!email || !isValidMemberEmail(email)) return false;
  if (age == null || !isValidMemberAge(Number(age))) return false;
  return true;
}

export function formatDisplayUserName(
  profile: { name?: string | null; id?: string | null; email?: string | null } | null | undefined,
  authDisplayName?: string | null
): string {
  const resolved = resolveMemberDisplayName(profile?.name, authDisplayName);
  if (resolved) return resolved;
  const emailLocal = (profile?.email || '').split('@')[0]?.trim();
  if (emailLocal && !looksLikeProviderReference(emailLocal)) return emailLocal;
  return 'Member';
}

/** Firestore `photoUrl` first, then optional Firebase Auth / OAuth photo fallback. */
export function resolveUserPhotoUrl(
  user?: { photoUrl?: string | null } | null,
  fallbackPhotoUrl?: string | null
): string {
  const stored = typeof user?.photoUrl === 'string' ? user.photoUrl.trim() : '';
  if (stored) return stored;
  const fallback = typeof fallbackPhotoUrl === 'string' ? fallbackPhotoUrl.trim() : '';
  return fallback;
}
