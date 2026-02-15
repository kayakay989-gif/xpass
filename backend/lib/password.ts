import crypto from 'crypto';

type HashRecord = {
  algo: 'pbkdf2';
  iterations: number;
  salt: string; // base64
  hash: string; // base64
};

const DEFAULT_ITERATIONS = 210_000;
const KEYLEN = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const iterations = DEFAULT_ITERATIONS;
  const derived = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST);
  const rec: HashRecord = {
    algo: 'pbkdf2',
    iterations,
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
  };
  return `pbkdf2:${rec.iterations}:${rec.salt}:${rec.hash}`;
}

export function isHashedPassword(value: any): value is string {
  return typeof value === 'string' && (value.startsWith('pbkdf2:') || value.startsWith('sha256:'));
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!isHashedPassword(stored)) return false;

  // sha256:<salt>:<hexDigest>
  if (stored.startsWith('sha256:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1] || '';
    const expectedHex = parts[2] || '';
    const actualHex = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
    // constant time compare
    const a = Buffer.from(actualHex, 'utf8');
    const b = Buffer.from(expectedHex, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // pbkdf2:<iterations>:<saltB64>:<hashB64>
  const parts = stored.split(':');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const hash = Buffer.from(parts[3], 'base64');
  const derived = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST);
  return crypto.timingSafeEqual(hash, derived);
}

