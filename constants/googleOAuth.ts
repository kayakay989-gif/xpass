import { Platform } from 'react-native';

function readExpoExtraString(key: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};
    const v = extra?.[key];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

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

/** Android OAuth 2.0 client — must match client_type 1 in android/app/google-services.json. */
export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '40764236173-bb7qk1245ec2sgn1g02v9had3l9p1flj.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim()) ||
  readExpoExtraString('googleIosClientId') ||
  '40764236173-c56mvsahjfj5oftc78j5v0lviqhi49ie.apps.googleusercontent.com';

export const GOOGLE_CONFIG = {
  iosClientId: GOOGLE_IOS_CLIENT_ID,
};

/**
 * expo-auth-session defaults to `Application.applicationId:/oauthredirect` (e.g. com.xpass.unique),
 * which triggers Google's "Custom URI scheme is not enabled for your Android client".
 * OAuth redirect must use the reversed client id form for the **Android** / **iOS** OAuth clients.
 *
 * **Google Cloud Console (required for Android):** open the OAuth 2.0 Client ID of type **Android**
 * whose ID matches GOOGLE_ANDROID_CLIENT_ID → **Advanced settings** → enable
 * **Custom URI scheme** (Google disabled this by default for new clients; without it, sign-in shows
 * Error 400 `invalid_request` in the browser). Same project as Firebase.
 */
export function getGoogleNativeOAuthRedirectUri(): string | undefined {
  if (Platform.OS === 'web') return undefined;
  const full =
    Platform.OS === 'android' ? GOOGLE_ANDROID_CLIENT_ID : GOOGLE_IOS_CLIENT_ID;
  const idPart = full.replace(/\.apps\.googleusercontent\.com$/i, '').trim();
  return `com.googleusercontent.apps.${idPart}:/oauthredirect`;
}
