/**
 * Audit gymOwners collection for login inconsistencies.
 * Run: bun scripts/diagnose-gym-owners.ts
 * Optional fix: bun scripts/diagnose-gym-owners.ts --fix
 */

import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

import { firestoreGymOwners, firestoreGyms } from '../backend/lib/firestore-admin';
import {
  buildGymOwnerUsername,
  normalizeGymOwnerUsername,
  usernamesMatchForLogin,
} from '../lib/gym-owner-username';

const shouldFix = process.argv.includes('--fix');

type SuspiciousRecord = {
  ownerId: string;
  gymId: string;
  issues: string[];
  username: string;
  usernameNormalized?: string;
  hasPasswordHash: boolean;
  hasLegacyPlainPassword: boolean;
  gymExists: boolean;
};

async function main() {
  console.log('=== Gym Owner Authentication Diagnostics ===\n');

  const owners = await firestoreGymOwners.getAll();
  let gyms: { id: string; name: string }[] = [];
  try {
    gyms = await firestoreGyms.getAll();
  } catch {
    console.warn('Could not load gyms list; gymExists checks skipped.\n');
  }
  const gymIds = new Set(gyms.map((g) => g.id));
  const gymNameById = new Map(gyms.map((g) => [g.id, g.name]));

  const suspicious: SuspiciousRecord[] = [];
  const normalizedIndex = new Map<string, string[]>();
  const gymIdIndex = new Map<string, string[]>();
  const exactUsernameIndex = new Map<string, string[]>();

  for (const owner of owners) {
    const issues: string[] = [];
    const normalized = normalizeGymOwnerUsername(owner.username);
    const storedNormalized = owner.usernameNormalized
      ? normalizeGymOwnerUsername(owner.usernameNormalized)
      : '';

    if (!owner.username?.trim()) issues.push('empty_username');
    if (owner.username !== owner.username.trim()) issues.push('leading_or_trailing_spaces_in_username');
    if (owner.username !== normalized) issues.push('username_not_canonical_lowercase');
    if (!owner.usernameNormalized) issues.push('missing_usernameNormalized');
    else if (storedNormalized !== normalized) issues.push('usernameNormalized_mismatch');

    if (!owner.passwordHash && !owner.password) issues.push('no_credentials');
    if (owner.password && !owner.passwordHash) issues.push('legacy_plaintext_password_only');

    if (gyms.length > 0 && !gymIds.has(owner.gymId)) issues.push('orphan_gymId_no_gym_doc');

    const gymName = gymNameById.get(owner.gymId);
    if (gymName && normalized) {
      const expected = buildGymOwnerUsername(owner.gymId, gymName);
      if (!usernamesMatchForLogin(expected, owner.username)) {
        issues.push(`username_differs_from_canonical_pattern (expected~${expected})`);
      }
    }

    const track = (map: Map<string, string[]>, key: string, id: string) => {
      const list = map.get(key) || [];
      list.push(id);
      map.set(key, list);
    };
    track(normalizedIndex, normalized || '(empty)', owner.id);
    track(gymIdIndex, owner.gymId || '(empty)', owner.id);
    track(exactUsernameIndex, owner.username || '(empty)', owner.id);

    if (issues.length > 0) {
      suspicious.push({
        ownerId: owner.id,
        gymId: owner.gymId,
        issues,
        username: owner.username,
        usernameNormalized: owner.usernameNormalized,
        hasPasswordHash: Boolean(owner.passwordHash),
        hasLegacyPlainPassword: Boolean(owner.password),
        gymExists: gyms.length === 0 ? true : gymIds.has(owner.gymId),
      });
    }

    if (shouldFix && owner.id) {
      try {
        await firestoreGymOwners.ensureUsernameCanonical(owner);
      } catch (e) {
        console.warn(`[fix] Failed for ${owner.id}:`, e);
      }
    }
  }

  const dupNormalized = [...normalizedIndex.entries()].filter(([, ids]) => ids.length > 1);
  const dupGymId = [...gymIdIndex.entries()].filter(([, ids]) => ids.length > 1);
  const dupExactUsername = [...exactUsernameIndex.entries()].filter(([, ids]) => ids.length > 1);

  console.log(`Total gymOwners: ${owners.length}`);
  console.log(`Suspicious records: ${suspicious.length}`);
  console.log(`Duplicate normalized usernames: ${dupNormalized.length}`);
  console.log(`Duplicate gymIds: ${dupGymId.length}`);
  console.log(`Duplicate exact usernames: ${dupExactUsername.length}\n`);

  if (dupNormalized.length > 0) {
    console.log('--- Duplicate normalized usernames ---');
    for (const [key, ids] of dupNormalized) {
      console.log(`  ${key}: ${ids.join(', ')}`);
    }
    console.log('');
  }

  if (dupGymId.length > 0) {
    console.log('--- Duplicate gymIds ---');
    for (const [key, ids] of dupGymId) {
      console.log(`  ${key}: ${ids.join(', ')}`);
    }
    console.log('');
  }

  if (suspicious.length > 0) {
    console.log('--- Suspicious records ---');
    for (const row of suspicious) {
      console.log(JSON.stringify(row, null, 2));
    }
  } else {
    console.log('No suspicious records detected.');
  }

  if (shouldFix) {
    console.log('\n--fix applied: username/usernameNormalized backfilled where possible.');
  } else {
    console.log('\nRe-run with --fix to backfill usernameNormalized on all owners.');
  }
}

main().catch((e) => {
  console.error('Diagnostics failed:', e?.message || e);
  console.error(`
Could not connect to Firestore. This script runs on YOUR COMPUTER (not in Firebase Console).

One-time setup:
1. Firebase Console → Project Settings (gear) → Service accounts
2. Click "Generate new private key" → save the JSON file
3. Put it here: backend/service-account-key.json
   (same folder as backend/lib/firebase-admin.ts)
4. Run again: npm run diagnose-gym-owners

Or set FIREBASE_SERVICE_ACCOUNT in .env.local to the full JSON (one line).
`);
  process.exit(1);
});
