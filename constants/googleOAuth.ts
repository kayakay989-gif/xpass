/**
 * Google OAuth client IDs for Expo AuthSession + Firebase (same GCP project as Firebase).
 *
 * Branding (Android account picker / consent): set the OAuth consent screen **App name** to "Xpass"
 * (and logo, support email) in Google Cloud Console → APIs & Services → OAuth consent screen.
 * If left as the default, users may see "project-…" instead of the product name.
 * - androidClientId → OAuth client type **Android** (package + SHA-1 in Cloud Console).
 * - webClientId → OAuth client type **Web** (Firebase often lists this as "Web client").
 * Never use webClientId as androidClientId.
 *
 * Web client → Authorized redirect URIs must include Expo proxy when needed:
 *   https://auth.expo.io/@essa989/xpass-subscription-app
 *
 * Overrides: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com';

/** Android OAuth 2.0 client (package com.xpass.unique + release SHA-1 in Console). */
export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '40764236173-5pvmbd98ufa0c4cooudea5pan896i37g.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '40764236173-c56mvsahjfj50ftc78j5v0lviqhi49ie.apps.googleusercontent.com';

export const GOOGLE_CONFIG = {
  iosClientId: GOOGLE_IOS_CLIENT_ID,
};
