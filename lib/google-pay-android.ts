/**
 * Google Pay Android Native Implementation
 * Uses Google Pay SDK for Android
 */

import { NativeModules, Platform } from 'react-native';

const { GooglePayModule } = NativeModules;

export interface GooglePayAndroidConfig {
  merchantName: string;
  merchantId: string;
  gateway: string;
  gatewayMerchantId: string;
  allowedNetworks: string[];
  currency: string;
  country: string;
  totalPrice: number;
}

export interface GooglePayAndroidResult {
  success: boolean;
  paymentToken?: string;
  error?: string;
}

/**
 * Check if Google Pay is available on Android
 */
export async function isGooglePayAvailableAndroid(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    if (GooglePayModule && GooglePayModule.isReadyToPay) {
      return await GooglePayModule.isReadyToPay();
    }
    return false;
  } catch (error) {
    console.error('[GooglePay] Error checking availability:', error);
    return false;
  }
}

/**
 * Request Google Pay payment on Android
 */
export async function requestGooglePayPaymentAndroid(
  config: GooglePayAndroidConfig
): Promise<GooglePayAndroidResult> {
  if (Platform.OS !== 'android') {
    return { success: false, error: 'Google Pay Android is only available on Android' };
  }

  if (!GooglePayModule || !GooglePayModule.requestPayment) {
    return { 
      success: false, 
      error: 'Google Pay module is not available. Please ensure the native module is properly installed.' 
    };
  }

  try {
    // Create payment data request
    const paymentDataRequest = {
      merchantName: config.merchantName,
      merchantId: config.merchantId,
      gateway: config.gateway,
      gatewayMerchantId: config.gatewayMerchantId,
      allowedNetworks: config.allowedNetworks,
      currency: config.currency,
      country: config.country,
      totalPrice: config.totalPrice.toFixed(2),
    };

    // Request payment
    const paymentData = await GooglePayModule.requestPayment(paymentDataRequest);

    // Extract token
    const paymentToken = paymentData?.paymentMethodData?.tokenizationData?.token;

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
