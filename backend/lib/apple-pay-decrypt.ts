import crypto from 'crypto';

/**
 * Apple Pay payment token decryption (self-managed).
 *
 * Apple Pay returns PKPaymentToken.paymentData as a JSON string:
 *   { version: "EC_v1", data, signature, header: { ephemeralPublicKey, publicKeyHash, transactionId } }
 *
 * For EC_v1 tokens we:
 *   1. Derive an ECDH shared secret between our merchant private key and the
 *      ephemeral public key in the token header.
 *   2. Derive the AES-256 key with the NIST SP800-56A single-step KDF (SHA-256).
 *   3. AES-256-GCM decrypt `data` (IV = 16 zero bytes, auth tag = last 16 bytes).
 *
 * The decrypted card fields are then sent to the MPGS gateway (see
 * payWithDecryptedApplePay), per the gateway's "Decrypting the Payment Token" flow.
 *
 * Required env:
 *   APPLE_PAY_PRIVATE_KEY  EC private key (PEM) matching the Apple Pay Payment
 *                          Processing Certificate. Newlines may be escaped as \n.
 *   APPLE_PAY_MERCHANT_ID  Apple merchant id (defaults to merchant.com.xpass.app).
 */

export interface DecryptedApplePayCard {
  number: string; // DPAN
  expiryMonth: string; // MM
  expiryYear: string; // YY
  cryptogram: string; // onlinePaymentCryptogram
  eci?: string; // eciIndicator
  currencyCode?: string;
  transactionAmount?: number;
}

interface ApplePayToken {
  version?: string;
  data: string;
  signature?: string;
  header: {
    ephemeralPublicKey: string;
    publicKeyHash?: string;
    transactionId?: string;
  };
}

function getMerchantPrivateKey(): crypto.KeyObject {
  const pem = process.env.APPLE_PAY_PRIVATE_KEY;
  if (!pem) {
    throw new Error('APPLE_PAY_PRIVATE_KEY is not configured');
  }
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  return crypto.createPrivateKey(normalized);
}

function getMerchantId(): string {
  return process.env.APPLE_PAY_MERCHANT_ID || 'merchant.com.xpass.app';
}

/**
 * Derives the AES-256 symmetric key per Apple's Payment Token Format Reference.
 * symmetricKey = SHA256( 0x00000001 || Z || (0x0D || "id-aes256-GCM") || "Apple" || SHA256(merchantId) )
 */
export function deriveSymmetricKey(sharedSecret: Buffer, merchantId: string): Buffer {
  const merchantIdHash = crypto.createHash('sha256').update(merchantId, 'utf8').digest();
  const otherInfo = Buffer.concat([
    Buffer.from([0x0d]),
    Buffer.from('id-aes256-GCM', 'utf8'),
    Buffer.from('Apple', 'utf8'),
    merchantIdHash,
  ]);
  const counter = Buffer.from([0x00, 0x00, 0x00, 0x01]);
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([counter, sharedSecret, otherInfo]))
    .digest();
}

export function decryptApplePayToken(
  tokenInput: string | ApplePayToken
): DecryptedApplePayCard {
  let token: ApplePayToken;
  try {
    token = typeof tokenInput === 'string' ? JSON.parse(tokenInput) : tokenInput;
  } catch {
    throw new Error('Invalid Apple Pay token: not valid JSON');
  }

  if (!token?.data || !token?.header?.ephemeralPublicKey) {
    throw new Error('Invalid Apple Pay token structure');
  }
  if (token.version && token.version !== 'EC_v1') {
    throw new Error(`Unsupported Apple Pay token version: ${token.version}`);
  }

  const privateKey = getMerchantPrivateKey();
  const merchantId = getMerchantId();

  // 1) ECDH shared secret
  const ephemeralPublicKey = crypto.createPublicKey({
    key: Buffer.from(token.header.ephemeralPublicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const sharedSecret = crypto.diffieHellman({ privateKey, publicKey: ephemeralPublicKey });

  // 2) Derive AES key
  const symmetricKey = deriveSymmetricKey(sharedSecret, merchantId);

  // 3) AES-256-GCM decrypt
  const data = Buffer.from(token.data, 'base64');
  if (data.length <= 16) {
    throw new Error('Apple Pay token data too short');
  }
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const iv = Buffer.alloc(16, 0);

  let decrypted: Buffer;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, iv);
    decipher.setAuthTag(tag);
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Apple Pay token decryption failed (auth tag mismatch)');
  }

  let payment: any;
  try {
    payment = JSON.parse(decrypted.toString('utf8'));
  } catch {
    throw new Error('Decrypted Apple Pay payload is not valid JSON');
  }

  const pan: string | undefined = payment.applicationPrimaryAccountNumber;
  const exp: string | undefined = payment.applicationExpirationDate; // YYMMDD
  const cryptogram: string | undefined = payment.paymentData?.onlinePaymentCryptogram;
  const eci: string | undefined = payment.paymentData?.eciIndicator;

  if (!pan || !exp || exp.length < 4 || !cryptogram) {
    throw new Error('Decrypted Apple Pay token is missing required fields');
  }

  return {
    number: pan,
    expiryYear: exp.substring(0, 2),
    expiryMonth: exp.substring(2, 4),
    cryptogram,
    eci,
    currencyCode: payment.currencyCode,
    transactionAmount: payment.transactionAmount,
  };
}
