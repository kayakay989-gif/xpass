#!/usr/bin/env node
/**
 * Set Firebase / GCP project display name to "Xpass" so phone OTP SMS uses
 * "Xpass" instead of "xpass-rork-1e6ad" / "xpass-rork-1e6ad.firebaseapp.com".
 *
 * SMS %APP_NAME% sources (Firebase docs):
 * - Play Integrity path (Android/iOS prod): Play Store / App Store listing name
 * - reCAPTCHA fallback: PROJECT_ID.firebaseapp.com (avoid by fixing SHA + Play install)
 * - Email templates: GCP project display name
 *
 * Usage:
 *   node scripts/set-firebase-otp-branding.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-firebase-otp-branding.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PROJECT_ID = 'xpass-rork-1e6ad';
const DISPLAY_NAME = 'Xpass';

function findServiceAccountPath() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const local = path.join(root, 'xpass-rork-1e6ad-firebase-adminsdk-fbsvc-fb36148601.json');
  if (fs.existsSync(local)) return local;
  return null;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign
    .sign(serviceAccount.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token error ${res.status}`);
  }
  return data.access_token;
}

async function patchJson(url, token, body, method = 'PATCH') {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const saPath = findServiceAccountPath();
  if (!saPath) {
    console.error('No service account JSON found. Set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  console.log(`Using service account: ${serviceAccount.client_email}`);
  const token = await getAccessToken(serviceAccount);

  // 1) Firebase project display name (Authentication public-facing name)
  const firebaseUrl = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}?updateMask=displayName`;
  const firebaseResult = await patchJson(firebaseUrl, token, { displayName: DISPLAY_NAME });
  console.log('\nFirebase project displayName:');
  if (firebaseResult.ok) {
    console.log(`  ✓ Updated to "${DISPLAY_NAME}"`);
  } else {
    console.log(`  ✗ Failed (${firebaseResult.status}):`, firebaseResult.json);
  }

  // 2) GCP project name (parent resource)
  const crmUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`;
  const crmResult = await patchJson(crmUrl, token, { name: DISPLAY_NAME });
  console.log('\nGCP project name:');
  if (crmResult.ok) {
    console.log(`  ✓ Updated to "${DISPLAY_NAME}"`);
  } else {
    console.log(`  ✗ Failed (${crmResult.status}):`, crmResult.json);
  }

  // 3) Read Identity Toolkit config (SMS template is output-only)
  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
  const configRes = await fetch(configUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (configRes.ok) {
    const config = await configRes.json();
    const smsTemplate =
      config?.notification?.sendSms?.smsTemplate?.content ||
      config?.notification?.sendSms?.smsTemplate ||
      null;
    console.log('\nCurrent SMS template (read-only):');
    console.log(`  ${smsTemplate || '(not returned)'}`);
  } else {
    console.log('\nCould not read Identity Toolkit config:', configRes.status);
  }

  console.log('\nAlso verify manually:');
  console.log('  • Firebase Console → Authentication → Settings → Public-facing name = Xpass');
  console.log('  • Google Cloud → OAuth consent screen → App name = Xpass');
  console.log('  • Play Console → Main store listing → App name = Xpass');
  console.log('  • Install app from Play (internal testing) so Play Integrity uses store name');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
