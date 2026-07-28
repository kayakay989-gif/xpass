import crypto from 'crypto';
import assert from 'node:assert/strict';
import { decryptApplePayToken } from '../backend/lib/apple-pay-decrypt';

/**
 * Round-trip verification of the Apple Pay decryption pipeline.
 *
 * This independently re-implements the ENCRYPT side exactly per Apple's
 * "Payment Token Format Reference" (ECDH P-256 -> SP800-56A KDF -> AES-256-GCM,
 * 16-byte zero IV) and confirms decryptApplePayToken() reverses it. If both the
 * spec-compliant encrypt and our decrypt agree, real Apple Pay tokens decrypt
 * correctly too.
 */

function kdf(sharedSecret: Buffer, merchantId: string): Buffer {
  const merchantIdHash = crypto.createHash('sha256').update(merchantId, 'utf8').digest();
  const otherInfo = Buffer.concat([
    Buffer.from([0x0d]),
    Buffer.from('id-aes256-GCM', 'utf8'),
    Buffer.from('Apple', 'utf8'),
    merchantIdHash,
  ]);
  const counter = Buffer.from([0x00, 0x00, 0x00, 0x01]);
  return crypto.createHash('sha256').update(Buffer.concat([counter, sharedSecret, otherInfo])).digest();
}

function buildEncryptedToken(merchantId: string, merchantPublicKey: crypto.KeyObject, payload: object) {
  const ephemeral = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: merchantPublicKey,
  });
  const symmetricKey = kdf(sharedSecret, merchantId);

  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const data = Buffer.concat([ciphertext, tag]).toString('base64');

  const ephemeralPublicKey = ephemeral.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  return {
    version: 'EC_v1',
    data,
    signature: '',
    header: { ephemeralPublicKey, publicKeyHash: '', transactionId: 'test-txn' },
  };
}

function run() {
  const merchantId = 'merchant.test.xpass';
  const merchant = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  process.env.APPLE_PAY_MERCHANT_ID = merchantId;
  process.env.APPLE_PAY_PRIVATE_KEY = merchant.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();

  const samplePayload = {
    applicationPrimaryAccountNumber: '5204240000001932',
    applicationExpirationDate: '281130', // YYMMDD
    currencyCode: '400',
    transactionAmount: 1099,
    cardholderName: 'Test User',
    paymentData: {
      onlinePaymentCryptogram: 'Af9x/QwAA/DjmU65oyc1MAABAAA=',
      eciIndicator: '07',
    },
  };

  const token = buildEncryptedToken(merchantId, merchant.publicKey, samplePayload);
  const result = decryptApplePayToken(JSON.stringify(token));

  assert.equal(result.number, '5204240000001932', 'DPAN mismatch');
  assert.equal(result.expiryYear, '28', 'expiry year mismatch');
  assert.equal(result.expiryMonth, '11', 'expiry month mismatch');
  assert.equal(result.cryptogram, 'Af9x/QwAA/DjmU65oyc1MAABAAA=', 'cryptogram mismatch');
  assert.equal(result.eci, '07', 'eci mismatch');

  // Tampering with the ciphertext must fail (GCM auth tag protects integrity).
  const tampered = { ...token, data: Buffer.from(token.data, 'base64').reverse().toString('base64') };
  let threw = false;
  try {
    decryptApplePayToken(JSON.stringify(tampered));
  } catch {
    threw = true;
  }
  assert.equal(threw, true, 'tampered token should fail decryption');

  // Object input (not just string) should also work.
  const result2 = decryptApplePayToken(token as any);
  assert.equal(result2.number, '5204240000001932', 'object input mismatch');

  console.log('PASS: Apple Pay decryption round-trip + integrity + object-input checks');
}

run();
