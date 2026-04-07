/**
 * Google OAuth client IDs for Expo AuthSession + Firebase.
 * Never use webClientId as androidClientId / iosClientId.
 *
 * Web client → Authorized redirect URIs must include:
 *   https://auth.expo.io/@essa989/xpass-subscription-app
 *
 * Overrides: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '442632916178-das3ntu5u85lmgt6o3id5eeu18q2kve8.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '442632916178-74jt1lpgq98podv4olb8o7lvkijt1u6r.apps.googleusercontent.com';
