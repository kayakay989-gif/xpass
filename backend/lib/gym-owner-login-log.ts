/**
 * Structured gym owner login diagnostics (no passwords or hashes).
 */

export type GymOwnerLoginLogEvent = {
  event: 'gym_owner_login_attempt' | 'gym_owner_login_success' | 'gym_owner_login_failure';
  receivedUsernameLength: number;
  normalizedUsername: string;
  lookupMethod?: string;
  candidateCount?: number;
  userFound: boolean;
  passwordVerified?: boolean;
  ownerId?: string;
  gymId?: string;
  matchedOwnerId?: string;
  reason?: string;
  origin?: string | null;
  userAgent?: string | null;
  environment?: string;
  nodeEnv?: string;
  apiResponseCode?: string;
};

export function logGymOwnerLogin(event: GymOwnerLoginLogEvent): void {
  const payload = {
    ...event,
    ts: new Date().toISOString(),
  };
  console.log('[GymOwnerAuth]', JSON.stringify(payload));
}

export function parseRequestMeta(req: Request): {
  origin: string | null;
  userAgent: string | null;
  environment: string;
  nodeEnv: string;
} {
  return {
    origin: req.headers.get('origin'),
    userAgent: req.headers.get('user-agent'),
    environment: process.env.RENDER_SERVICE_NAME ? 'render' : process.env.NODE_ENV || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
  };
}
