// Server entry point - works with both Bun and Node.js
import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import fs from 'fs';

// Load local environment variables (not committed)
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

import app from './backend/hono';
import { applyDailyMissedCheckInCreditDeduction } from './backend/lib/credits';
import { runSubscriptionExpiryEmailJob } from './backend/lib/subscription-expiry-emails';

const port = Number(process.env.PORT || 3000);

console.log(`[Server] Starting backend server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`[Server] ✅ Backend server running (port ${info.port})`);
});

let lastCreditsRunDayKey = '';
const maybeRunDailyCreditsJob = async () => {
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
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

const runExpiryEmails = async () => {
  try {
    await runSubscriptionExpiryEmailJob();
  } catch (error) {
    console.error('[SubscriptionEmailJob] Failed:', error);
  }
};

void runExpiryEmails();
setInterval(() => {
  void runExpiryEmails();
}, 60 * 60 * 1000);

