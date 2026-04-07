/**
 * Google OAuth client IDs for Expo / Firebase.
 * Web client is used as server-side token audience only — never as androidClientId/iosClientId.
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com';

export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '40764236173-5pvmbd98ufa0c4cooudea5pan896i37g.apps.googleusercontent.com';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  '40764236173-c56mvsahjfj5oftc78j5v0lviqhi49ie.apps.googleusercontent.com';
