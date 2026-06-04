/**
 * Structured gym owner login diagnostics (no passwords or hashes).
 */

export type GymOwnerLoginLogEvent = {
  event: 'gym_owner_login_attempt' | 'gym_owner_login_success' | 'gym_owner_login_failure';
  receivedUsernameLength: number;
  normalizedUsername: string;
  lookupMethod?: string;
  userFound: boolean;
  passwordVerified?: boolean;
  ownerId?: string;
  gymId?: string;
  reason?: string;
  origin?: string | null;
  userAgent?: string | null;
  apiResponseCode?: string;
};

export function logGymOwnerLogin(event: GymOwnerLoginLogEvent): void {
  const payload = {
    ...event,
    ts: new Date().toISOString(),
  };
  console.log('[GymOwnerAuth]', JSON.stringify(payload));
}

export function parseRequestMeta(req: Request): { origin: string | null; userAgent: string | null } {
  return {
    origin: req.headers.get('origin'),
    userAgent: req.headers.get('user-agent'),
  };
}
