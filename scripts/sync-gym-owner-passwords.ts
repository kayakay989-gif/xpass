/**
 * Sync all gym owner passwords to canonical gym_{first8(gymId)} hashes.
 * Run: npx tsx scripts/sync-gym-owner-passwords.ts
 * Dry run: npx tsx scripts/sync-gym-owner-passwords.ts --dry-run
 */

import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

import { firestoreGymOwners, firestoreGyms } from '../backend/lib/firestore-admin';
import { syncGymOwnerPasswordForGym } from '../backend/lib/gym-owner-credentials';
import { buildGymOwnerDefaultPassword } from '../lib/gym-owner-username';
import { verifyPassword } from '../backend/lib/password';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const owners = await firestoreGymOwners.getAll();
  const gyms = await firestoreGyms.getAll();
  const gymNameById = new Map(gyms.map((g) => [g.id, g.name]));

  console.log(`=== Sync gym owner passwords (${dryRun ? 'DRY RUN' : 'APPLY'}) ===\n`);
  console.log(`Owners: ${owners.length}\n`);

  let updated = 0;
  let alreadyOk = 0;
  let missingGym = 0;

  for (const owner of owners) {
    const gymName = gymNameById.get(owner.gymId);
    if (!gymName) {
      console.warn('SKIP missing gym:', owner.gymId, owner.username);
      missingGym++;
      continue;
    }

    const canonicalPassword = buildGymOwnerDefaultPassword(owner.gymId);
    const ok =
      owner.passwordHash && verifyPassword(canonicalPassword, owner.passwordHash);

    if (ok && owner.usernameNormalized) {
      console.log(`OK  ${owner.username} -> ${canonicalPassword}`);
      alreadyOk++;
      continue;
    }

    console.log(`FIX ${owner.username} -> ${canonicalPassword}`);
    if (!dryRun) {
      await syncGymOwnerPasswordForGym(owner.gymId);
      updated++;
    }
  }

  console.log(`\nDone. alreadyOk=${alreadyOk} updated=${updated} missingGym=${missingGym}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
