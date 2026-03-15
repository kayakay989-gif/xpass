# Google Pay SDK Implementation Guide

## Overview

Google Pay SDK has been integrated into the XPASS mobile app for Android. The implementation uses the unified checkout endpoint and supports wallet balance combined with Google Pay payments.

## Architecture

- **Frontend**: React Native payment screen with Google Pay button
- **Native Module**: Android Kotlin module (`GooglePayModule.kt`) that wraps Google Pay SDK
- **Backend**: Unified `/payments/checkout` endpoint that processes Google Pay tokens
- **Payment Gateway**: Mastercard MPGS API

## Files Created

### 1. Native Android Module
- `android/app/src/main/java/com/xpass/app/GooglePayModule.kt` - Native Google Pay module
- `android/app/src/main/java/com/xpass/app/GooglePayPackage.kt` - React Native package registration

### 2. JavaScript Bridge
- `lib/google-pay.ts` - Unified Google Pay interface (web + Android)
- `lib/google-pay-android.ts` - Android-specific implementation

### 3. Expo Config Plugin
- `plugins/withGooglePay.ts` - Automatically adds Google Pay SDK dependency and registers module

## Setup Instructions

### Step 1: Add Google Pay SDK Dependency

The Expo plugin automatically adds the dependency to `app/build.gradle`:

```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-wallet:19.5.0'
}
```

### Step 2: Register Native Module

The plugin automatically registers `GooglePayPackage` in `MainApplication.kt`:

```kotlin
override fun getPackages(): List<ReactPackage> = listOf(
    GooglePayPackage(),
    // ... other packages
)
```

### Step 3: Build the App

After adding the plugin to `app.json`, rebuild the app:

```bash
# For development build
npx expo prebuild --clean
npx expo run:android

# For production build
eas build --platform android
```

## Configuration

### Merchant Information

Configured in `lib/google-pay.ts` and `app/payment.tsx`:

- **Merchant Name**: `XPASS`
- **Merchant ID**: `BCR2DN5T22RLHU35`
- **Gateway**: `mastercard`
- **Gateway Merchant ID**: `9589667361EP`
- **Allowed Networks**: `VISA`, `MASTERCARD`
- **Currency**: `JOD`
- **Country**: `JO`

### Environment

The native module uses `ENVIRONMENT_TEST` by default. For production:

Update `GooglePayModule.kt`:

```kotlin
.setEnvironment(WalletConstants.ENVIRONMENT_PRODUCTION)
```

## Payment Flow

1. User toggles wallet balance (optional)
2. System calculates `walletUsed` and `remainingAmount`
3. User selects Google Pay as payment method
4. User taps "Pay with Google Pay" button
5. Google Pay sheet opens (native Android)
6. User authenticates and confirms payment
7. Google Pay SDK returns encrypted payment token
8. Token is sent to `/payments/checkout` endpoint
9. Backend processes payment via Mastercard MPGS API
10. Wallet is deducted (if used)
11. Subscription is activated

## Testing

### Test Mode

The implementation uses `ENVIRONMENT_TEST` for development. Test with:

- Test cards provided by Google Pay
- Google Pay test accounts

### Production

Before going live:

1. Update environment to `ENVIRONMENT_PRODUCTION` in `GooglePayModule.kt`
2. Verify merchant ID and gateway merchant ID
3. Test with real cards in production environment
4. Ensure Google Pay Console is configured

## Error Handling

The implementation handles:

- Google Pay not available
- User cancellation
- Payment token extraction failures
- Network errors
- Backend payment failures

All errors are displayed to the user with clear messages.

## Integration with Unified Checkout

Google Pay uses the existing unified checkout endpoint:

```typescript
POST /payments/checkout
{
  userId: string,
  tier: string,
  duration: number,
  useWallet: boolean,
  paymentMethod: "google_pay",
  paymentToken: string, // From Google Pay SDK
  couponCode?: string,
  currency: "JOD"
}
```

The backend:
1. Calculates wallet usage
2. Charges remaining amount via Mastercard MPGS API using the token
3. Deducts wallet (if used)
4. Activates subscription
5. Creates transaction records

## Important Notes

- **No duplicate payment flows**: Google Pay uses the same unified checkout endpoint
- **Wallet support**: Wallet balance can be combined with Google Pay
- **Token security**: Payment tokens are encrypted by Google Pay SDK
- **Error recovery**: If Google Pay fails, user can try card payment
- **Platform support**: Google Pay is available on Android and web (Chrome)

## Troubleshooting

### Google Pay button not showing

1. Check if Google Pay is available: `isGooglePayAvailable()`
2. Verify native module is registered: Check `MainApplication.kt`
3. Ensure Google Pay SDK dependency is added: Check `app/build.gradle`

### Payment token extraction fails

1. Verify Google Pay SDK version compatibility
2. Check payment data structure matches expected format
3. Review native module logs for errors

### Module not found error

1. Rebuild the app: `npx expo prebuild --clean`
2. Verify package registration in `MainApplication.kt`
3. Check that `GooglePayPackage.kt` exists
