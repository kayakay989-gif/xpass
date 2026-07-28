// Server entry point - production Node build
// Register TS path aliases for compiled JS (so imports like "@/backend/..." resolve under Node).
// IMPORTANT: do this before requiring any modules that use path aliases.
import fs from 'fs';
import { register } from 'tsconfig-paths';
import dotenv from 'dotenv';

// IMPORTANT: baseUrl must point to the compiled output directory so `@/*` resolves to `dist/*`.
register({ baseUrl: __dirname, paths: { '@/*': ['*'] } });

// Load local environment variables (not committed)
// Supported: .env.local (recommended), falls back to .env if present.
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

// After registering path aliases + loading env, load the server app.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { serve } = require('@hono/node-server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('./backend/hono').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applyDailyMissedCheckInCreditDeduction } = require('./backend/lib/credits');
const { ammanDayKey } = require('./lib/jordan-time');

const port = Number(process.env.PORT || 3000);

console.log(`[Server] Starting backend server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info: { port: number }) => {
  console.log(`[Server] ✅ Backend server running (port ${info.port})`);
});

let lastCreditsRunDayKey = '';
const maybeRunDailyCreditsJob = async () => {
  const now = new Date();
  const dayKey = ammanDayKey(now);
  if (lastCreditsRunDayKey === dayKey) return;
  try {
    await applyDailyMissedCheckInCreditDeduction(now);
    lastCreditsRunDayKey = dayKey;
    console.log('[CreditsJob] Daily missed check-in deduction completed.');
  } catch (error) {
    console.error('[CreditsJob] Failed to process daily deduction:', error);
  }
};

void maybeRunDailyCreditsJob();
setInterval(() => {
  void maybeRunDailyCreditsJob();
}, 60 * 60 * 1000);

