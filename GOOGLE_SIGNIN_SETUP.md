# Google Sign-In Setup Guide

This guide explains how to configure Google sign-in for your Expo app with Firebase.

## Overview

Google sign-in has been implemented using:
- **Web**: Firebase's built-in `signInWithPopup` method
- **Native (iOS/Android)**: `expo-auth-session` with Google OAuth

## Prerequisites

1. Firebase project set up
2. Google OAuth Client ID configured

## Step 1: Enable Google Sign-In in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`xpass-rork-1e6ad`)
3. Go to **Authentication** → **Sign-in method**
4. Click on **Google**
5. Click **Enable**
6. Enter your project support email
7. Click **Save**

Firebase will automatically create OAuth 2.0 client IDs for web.

## Step 2: Get Google OAuth Client ID

### For Web (Automatic)

Firebase automatically handles web authentication. No additional configuration needed.

### For Native (iOS/Android)

You need to configure OAuth clients for native platforms:

#### Option A: Use Firebase's Client IDs

1. In Firebase Console → **Authentication** → **Sign-in method** → **Google**
2. Click on **Web SDK configuration**
3. Copy the **Web client ID** (starts with something like `40764236173-xxxxx.apps.googleusercontent.com`)

#### Option B: Create Native OAuth Clients

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. Configure:
   - **Application type**: iOS (or Android)
   - **Name**: Your app name
   - **Bundle ID** (iOS): `app.rork.xpass-multi-gym-fitness-subscription-app`
   - **Package name** (Android): `app.rork.xpass-multi-gym-fitness-subscription-app`
6. Click **Create**
7. Copy the **Client ID**

## Step 3: Configure Environment Variable

Create a `.env` file in your project root (if it doesn't exist):

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
```

**Important Notes:**
- The client ID above is from your `google-services.json` file and works for Android
- For **web**, Firebase automatically handles Google sign-in (no client ID needed)
- For **iOS**, you may want to create a separate iOS OAuth client ID
- The Android client ID is already configured in `google-services.json` for native builds

## Step 4: Add Redirect URI for Native

The app uses Expo's auth proxy by default. If you're using a custom scheme:

1. In Google Cloud Console → **Credentials** → Your OAuth client
2. Add authorized redirect URIs:
   - `https://auth.expo.io/@your-expo-username/your-app-slug`
   - Or your custom scheme: `myapp://` (matches `scheme` in `app.json`)

## Step 5: Test Google Sign-In

1. **Web**: Run `npm run start-web` and test Google sign-in
2. **Native**: Run on a physical device or emulator and test Google sign-in

## Troubleshooting

### Error: "Google OAuth Client ID is not configured"

**Solution**: Set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in your `.env` file or environment variables.

### Error: "invalid_client"

**Solution**: 
- Verify the client ID is correct
- Make sure the redirect URI is authorized in Google Cloud Console
- For native, ensure you're using the correct client ID (iOS vs Android)

### Error: "No ID token received from Google"

**Solution**: 
- Make sure Google sign-in is enabled in Firebase Console
- Verify the OAuth client is properly configured in Google Cloud Console
- Check that you're using the correct client ID for your platform

### Web Sign-In Not Working

**Solution**:
- Make sure Google sign-in is enabled in Firebase Console
- Check browser console for errors
- Ensure popup blockers are disabled

### Native Sign-In Opens Browser but Doesn't Complete

**Solution**:
- Verify the redirect URI is correctly configured
- Check that `expo-auth-session` and `expo-web-browser` are installed
- Make sure the app scheme in `app.json` matches the redirect URI

## Implementation Details

The Google sign-in implementation:

1. **Web**: Uses Firebase's `signInWithPopup` which handles everything automatically
2. **Native**: 
   - Uses `expo-auth-session` to get Google OAuth credentials
   - Exchanges credentials for a Google ID token
   - Signs in to Firebase using the ID token
   - Automatically creates user profile in Firestore if it doesn't exist

## Code Location

- Authentication logic: `contexts/AuthContext.tsx`
- Login UI: `app/login.tsx`
- Firebase config: `lib/firebase.ts`

## Next Steps

After setting up Google sign-in:

1. Test on both web and native platforms
2. Configure additional OAuth scopes if needed
3. Set up proper error handling for production
4. Consider adding Google profile picture to user profile

