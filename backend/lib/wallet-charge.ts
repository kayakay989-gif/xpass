import { decryptApplePayToken } from '@/backend/lib/apple-pay-decrypt';
import { payWithDecryptedApplePay, payWithDeviceToken } from '@/backend/lib/mastercard';

export type WalletChargeType = 'APPLE_PAY' | 'GOOGLE_PAY';

function normalizeGooglePayToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Charge an Apple Pay or Google Pay device token through MPGS.
 *
 * Apple Pay:
 * - If APPLE_PAY_PRIVATE_KEY is configured → decrypt locally and PAY with DPAN + cryptogram.
 * - Otherwise → send raw PKPaymentToken JSON (MPGS gateway-managed decryption).
 *
 * Google Pay:
 * - Always send the gateway token JSON from Google Pay tokenizationData.token.
 *   Requires tokenization gateway name "mpgs" (not "mastercard").
 */
export async function chargeWalletToken(params: {
  orderId: string;
  paymentTransactionId: string;
  deviceToken: string;
  walletType: WalletChargeType;
  amount: number;
  currency: string;
  reference?: string;
}) {
  const { orderId, paymentTransactionId, deviceToken, walletType, amount, currency, reference } =
    params;

  if (!deviceToken?.trim()) {
    throw new Error('Wallet payment token is required');
  }

  if (walletType === 'APPLE_PAY' && process.env.APPLE_PAY_PRIVATE_KEY?.trim()) {
    const card = decryptApplePayToken(deviceToken);
    return payWithDecryptedApplePay({
      orderId,
      paymentTransactionId,
      card,
      amount,
      currency,
      reference,
    });
  }

  const normalizedToken =
    walletType === 'GOOGLE_PAY' ? normalizeGooglePayToken(deviceToken) : deviceToken.trim();

  return payWithDeviceToken({
    orderId,
    paymentTransactionId,
    deviceToken: normalizedToken,
    walletType,
    amount,
    currency,
    reference,
  });
}

export function extractGatewayUserMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const response = r.response as Record<string, unknown> | undefined;
  const errObj = r.error as Record<string, unknown> | undefined;
  const explanation =
    (typeof response?.acquirerMessage === 'string' && response.acquirerMessage) ||
    (typeof response?.gatewayRecommendation === 'string' && response.gatewayRecommendation) ||
    (typeof errObj?.explanation === 'string' && errObj.explanation) ||
    (typeof errObj?.cause === 'string' && errObj.cause);
  return explanation || null;
}
