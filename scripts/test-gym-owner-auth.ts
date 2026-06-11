/**
 * Unit checks for gym owner username/password normalization and credential verification.
 * Run: npx tsx scripts/test-gym-owner-auth.ts
 */

import assert from 'node:assert/strict';
import {
  buildGymOwnerDefaultPassword,
  normalizeGymOwnerUsername,
  sanitizeGymOwnerPassword,
  sanitizeGymOwnerUsernameInput,
  usernamesMatchForLogin,
} from '../lib/gym-owner-username';
import { hashPassword, verifyPassword } from '../backend/lib/password';
import { verifyGymOwnerCredentials, verifyGymOwnerPassword } from '../backend/lib/gym-owner-password';

function testUsernameNormalization() {
  assert.equal(normalizeGymOwnerUsername('  Gold_Gym_AE500B  '), 'gold_gym_ae500b');
  assert.equal(normalizeGymOwnerUsername('gold\u200Bgym_ae500b'), 'goldgym_ae500b');
  assert.equal(sanitizeGymOwnerUsernameInput('user\r\nname'), 'username');
  assert.equal(sanitizeGymOwnerUsernameInput(' user\tname '), 'username');
  assert(usernamesMatchForLogin('FitClub_AE500B', 'fitclub_ae500b'));
}

function testPasswordSanitization() {
  const gymId = 'ae500b5d-1234-5678-9abc-def012345678';
  const password = buildGymOwnerDefaultPassword(gymId);
  assert.equal(sanitizeGymOwnerPassword(` ${password}\n`), password);
  assert.equal(sanitizeGymOwnerPassword(`${password}\r\n`), password);
  assert.equal(sanitizeGymOwnerPassword(`${password}\uFEFF`), password);
}

function testPasswordVerification() {
  const gymId = 'ae500b5d-1234-5678-9abc-def012345678';
  const password = buildGymOwnerDefaultPassword(gymId);
  const hash = hashPassword(password);

  assert(verifyGymOwnerPassword(gymId, password, hash));
  assert(verifyGymOwnerPassword(gymId, ` ${password} `, hash));
  assert(verifyGymOwnerPassword(gymId, `gym_${gymId.substring(0, 6)}`, hash));

  assert(
    verifyGymOwnerCredentials(
      { gymId, passwordHash: hash, password: 'legacy-should-not-be-needed' },
      password
    )
  );

  assert(
    verifyGymOwnerCredentials(
      { gymId, passwordHash: 'pbkdf2:bad:bad:bad', password },
      password
    )
  );

  assert.equal(
    verifyGymOwnerCredentials(
      { gymId, passwordHash: 'pbkdf2:bad:bad:bad', password: 'wrong' },
      password
    ),
    false
  );
}

function testLegacyHashFormats() {
  const password = 'gym_ae500b5d';
  const sha256Hash = hashPassword(password).replace('pbkdf2', 'sha256'); // not valid
  assert.equal(verifyPassword(password, hashPassword(password)), true);
  assert.equal(verifyPassword(password, sha256Hash), false);
}

function main() {
  testUsernameNormalization();
  testPasswordSanitization();
  testPasswordVerification();
  testLegacyHashFormats();
  console.log('All gym owner auth unit checks passed.');
}

main();
