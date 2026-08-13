#!/usr/bin/env node
/**
 * Print Android signing SHA-1 fingerprints for Google Pay & Wallet Console.
 *
 * Register ALL relevant fingerprints for package com.xpass.unique:
 * - Play Console → Setup → App signing → App signing key certificate (required for Play installs)
 * - Play Console → Setup → App signing → Upload key certificate (EAS / direct uploads)
 * - Local debug keystore (only if sideloading debug builds)
 *
 * Console: https://pay.google.com/business/console
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const debugKeystore = path.join(root, 'android', 'app', 'debug.keystore');

function sha1FromKeystore(keystorePath, alias, storepass, keypass) {
  if (!existsSync(keystorePath)) {
    return null;
  }
  try {
    const out = execSync(
      `keytool -list -v -keystore "${keystorePath}" -alias ${alias} -storepass ${storepass} -keypass ${keypass}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const match = out.match(/SHA1:\s*([0-9A-F:]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

console.log('Google Pay Android registration checklist');
console.log('=========================================');
console.log('Package name: com.xpass.unique');
console.log('Merchant ID:  BCR2DN5T22RLHU35');
console.log('Gateway:      mpgs');
console.log('Gateway MID:  9589667361EP');
console.log('Environment:  PRODUCTION (GOOGLE_PAY_ENVIRONMENT in android/gradle.properties)');
console.log('');

const debugSha1 = sha1FromKeystore(debugKeystore, 'androiddebugkey', 'android', 'android');
if (debugSha1) {
  console.log('Debug keystore SHA-1 (local dev builds only):');
  console.log(`  ${debugSha1}`);
  console.log('');
}

console.log('Play Store / EAS builds — add these in Google Pay Console:');
console.log('  1. Play Console → Your app → Setup → App signing');
console.log('     Copy SHA-1 from "App signing key certificate" (users install via Play)');
console.log('  2. Same page → "Upload key certificate" (EAS builds before Play re-signs)');
console.log('');
console.log('After adding fingerprints, install a fresh production build (versionCode 44+).');
console.log('A 405 / merchant account error means the installed APK signing cert is missing.');
