/**
 * Google Pay SDK Integration
 * Supports both web (Google Pay JS API) and Android native (React Native)
 */

import { Platform, NativeModules } from 'react-native';
import { formatGatewayAmount } from '@/lib/money';

export interface GooglePayConfig {
  merchantName: string;
  merchantId: string;
  gateway: string;
  gatewayMerchantId: string;
  allowedNetworks: string[];
  currency: string;
  country: string;
  totalPrice: number;
}

export interface GooglePayResult {
  success: boolean;
  paymentToken?: string;
  error?: string;
}

/**
 * Check if Google Pay is available
 */
export async function isGooglePayAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' &&
           !!(window as any).google &&
           !!(window as any).google.payments &&
           !!(window as any).google.payments.api;
  } else if (Platform.OS === 'android') {
    // Check Android native Google Pay availability via native module
    try {
      const { GooglePayModule } = NativeModules;
      if (GooglePayModule && GooglePayModule.isReadyToPay) {
        return await GooglePayModule.isReadyToPay();
      }
      return false;
    } catch (error) {
      console.error('[GooglePay] Error checking Android availability:', error);
      return false;
    }
  }
  return false;
}

/**
 * Request Google Pay payment (Web implementation)
 */
export async function requestGooglePayPaymentWeb(
  config: GooglePayConfig
): Promise<GooglePayResult> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return { success: false, error: 'Google Pay is only available on web' };
  }

  try {
    const googlePay = (window as any).google.payments.api;

    const gateway =
      config.gateway.toLowerCase() === 'mastercard' ? 'mpgs' : config.gateway;

    // Create payment data request
    const paymentDataRequest = {
      apiVersion: 2,
      apiVersionMinor: 0,
      merchantInfo: {
        merchantName: config.merchantName,
        merchantId: config.merchantId,
      },
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: config.allowedNetworks,
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway,
              gatewayMerchantId: config.gatewayMerchantId,
            },
          },
        },
      ],
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: formatGatewayAmount(config.totalPrice, config.currency),
        currencyCode: config.currency,
        countryCode: config.country,
      },
    };

    // Request payment data
    const paymentData = await googlePay.loadPaymentData(paymentDataRequest);

    // Extract payment token
    const paymentToken = paymentData.paymentMethodData.tokenizationData.token;

    return {
      success: true,
      paymentToken: paymentToken,
    };
  } catch (error: any) {
    console.error('[GooglePay] Payment request failed:', error);
    return {
      success: false,
      error: error.message || 'Google Pay payment failed',
    };
  }
}

/**
 * Request Google Pay payment (Android native implementation)
 * Uses native Android Google Pay SDK via React Native bridge
 */
export async function requestGooglePayPaymentAndroid(
  config: GooglePayConfig
): Promise<GooglePayResult> {
  if (Platform.OS !== 'android') {
    return { success: false, error: 'Android Google Pay is only available on Android' };
  }

  try {
    // Use native module directly
    const { GooglePayModule } = NativeModules;
    
    if (!GooglePayModule || !GooglePayModule.requestPayment) {
      return { 
        success: false, 
        error: 'Google Pay module is not available. Please ensure the native module is properly installed.' 
      };
    }

    // Create payment request config
    const gateway =
      config.gateway.toLowerCase() === 'mastercard' ? 'mpgs' : config.gateway;
    const paymentConfig = {
      merchantName: config.merchantName,
      merchantId: config.merchantId,
      gateway,
      gatewayMerchantId: config.gatewayMerchantId,
      allowedNetworks: config.allowedNetworks,
      currency: config.currency,
      country: config.country,
      totalPrice: formatGatewayAmount(config.totalPrice, config.currency),
    };

    // Request payment via native module
    const paymentData = await GooglePayModule.requestPayment(paymentConfig);

    if (paymentData?.canceled) {
      return { success: false, error: 'Payment canceled' };
    }

    // Native module returns { paymentToken }; keep fallback for older shapes.
    const paymentToken =
      paymentData?.paymentToken ??
      paymentData?.paymentMethodData?.tokenizationData?.token;

    if (!paymentToken) {
      return { success: false, error: 'Failed to extract payment token from Google Pay response' };
    }

    return {
      success: true,
      paymentToken: paymentToken,
    };
  } catch (error: any) {
    console.error('[GooglePay] Android payment request failed:', error);
    return {
      success: false,
      error: error.message || 'Google Pay payment failed',
    };
  }
}

/**
 * Unified Google Pay payment request
 */
export async function requestGooglePayPayment(
  config: GooglePayConfig
): Promise<GooglePayResult> {
  if (Platform.OS === 'web') {
    return requestGooglePayPaymentWeb(config);
  } else if (Platform.OS === 'android') {
    return requestGooglePayPaymentAndroid(config);
  } else {
    return { success: false, error: 'Google Pay is not available on this platform' };
  }
}
