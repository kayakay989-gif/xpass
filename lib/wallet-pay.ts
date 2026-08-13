import { Platform, NativeModules } from 'react-native';
import config from '@/lib/config';

/**
 * Unified Apple Pay (iOS) / Google Pay (Android) helper.
 *
 * The native wallet sheet returns a tokenized payment token which is charged
 * server-side through the existing MPGS gateway (see backend payWithWallet). This
 * keeps PAN handling out of the app and tokenization consistent with the card flow.
 *
 * IMPORTANT: availability is gated on the presence of the platform native module
 * (ApplePayModule / GooglePayModule). Until those modules ship in a native build
 * with valid merchant credentials, isWalletPayAvailable() returns false and no
 * wallet UI is shown — guaranteeing the existing card flow is never affected.
 */

export type WalletMethod = 'apple_pay' | 'google_pay';

export interface WalletPaymentResult {
  success: boolean;
  paymentToken?: string;
  error?: string;
  canceled?: boolean;
}

export interface WalletPaymentRequest {
  amount: number;
  currency: string;
  /** Human-readable label shown on the wallet sheet (e.g. "Gold - 3 months"). */
  label?: string;
}

/** The wallet method native to the current platform, or null on web/unsupported. */
export function getWalletMethod(): WalletMethod | null {
  if (Platform.OS === 'ios') return 'apple_pay';
  if (Platform.OS === 'android') return 'google_pay';
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function appleModule(): any {
  return NativeModules?.ApplePayModule ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function googleModule(): any {
  return NativeModules?.GooglePayModule ?? null;
}

/** True only when the platform wallet is configured and ready to pay. */
export async function isWalletPayAvailable(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      const mod = appleModule();
      if (!mod || typeof mod.canMakePayments !== 'function') return false;
      if (!config.wallet.appleMerchantId) return false;
      return await mod.canMakePayments();
    }
    if (Platform.OS === 'android') {
      const mod = googleModule();
      if (!mod || typeof mod.isReadyToPay !== 'function') return false;
      if (!config.wallet.googleMerchantId || !config.wallet.gatewayMerchantId) return false;
      return await mod.isReadyToPay();
    }
    return false;
  } catch (e) {
    console.warn('[WalletPay] availability check failed', e);
    return false;
  }
}

/**
 * Presents the native wallet sheet and returns the tokenized payment token.
 * The token is then sent to the backend payWithWallet route for charging.
 */
export async function requestWalletPayment(
  req: WalletPaymentRequest
): Promise<WalletPaymentResult> {
  const amountStr = Number.isFinite(req.amount) ? req.amount.toFixed(2) : String(req.amount);

  try {
    if (Platform.OS === 'ios') {
      const mod = appleModule();
      if (!mod || typeof mod.requestPayment !== 'function') {
        return { success: false, error: 'Apple Pay is not available on this device' };
      }
      const result = await mod.requestPayment({
        merchantIdentifier: config.wallet.appleMerchantId,
        merchantName: config.wallet.merchantName,
        countryCode: config.wallet.country,
        currencyCode: req.currency,
        amount: amountStr,
        label: req.label || config.wallet.merchantName,
        supportedNetworks: config.wallet.allowedNetworks,
      });
      const token = result?.paymentToken ?? result?.token;
      if (result?.canceled) return { success: false, canceled: true };
      if (!token) return { success: false, error: 'Failed to obtain Apple Pay token' };
      return { success: true, paymentToken: typeof token === 'string' ? token : JSON.stringify(token) };
    }

    if (Platform.OS === 'android') {
      const mod = googleModule();
      if (!mod || typeof mod.requestPayment !== 'function') {
        return { success: false, error: 'Google Pay is not available on this device' };
      }
      const result = await mod.requestPayment({
        merchantName: config.wallet.merchantName,
        merchantId: config.wallet.googleMerchantId,
        gateway:
          config.wallet.gateway.toLowerCase() === 'mastercard'
            ? 'mpgs'
            : config.wallet.gateway,
        gatewayMerchantId: config.wallet.gatewayMerchantId,
        allowedNetworks: config.wallet.allowedNetworks,
        currency: req.currency,
        country: config.wallet.country,
        totalPrice: amountStr,
      });
      const token = result?.paymentMethodData?.tokenizationData?.token ?? result?.paymentToken;
      if (result?.canceled) return { success: false, canceled: true };
      if (!token) return { success: false, error: 'Failed to obtain Google Pay token' };
      return { success: true, paymentToken: typeof token === 'string' ? token : JSON.stringify(token) };
    }

    return { success: false, error: 'Wallet payment is not supported on this platform' };
  } catch (e: any) {
    if (e?.code === 'CANCELED' || /cancel/i.test(String(e?.message))) {
      return { success: false, canceled: true };
    }
    console.error('[WalletPay] payment request failed', e);
    return { success: false, error: e?.message || 'Wallet payment failed' };
  }
}
