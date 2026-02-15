# Android Firebase Setup Guide

This guide explains how Firebase is configured for Android native builds in your Expo app.

## Overview

Your app uses Firebase JS SDK, which works in Expo Go. For native Android builds (via EAS or `expo prebuild`), additional configuration is needed for Google Sign-In and native Firebase features.

## Configuration Files

### 1. google-services.json

The `google-services.json` file has been placed in the project root with the correct package name:
- **Package Name**: `app.rork.xpass-multi-gym-fitness-subscription-app`
- **Project ID**: `xpass-rork-1e6ad`
- **Client ID**: `40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com`

This file will be automatically placed in `android/app/` during the build process.

### 2. expo-build-properties Plugin

The `expo-build-properties` plugin has been added to `app.json` to automatically configure the Google Services plugin for Android builds.

## How It Works

### For Expo Managed Workflow (Current)

When you build your app using EAS Build or run `expo prebuild`:
1. Expo automatically copies `google-services.json` to `android/app/google-services.json`
2. The `expo-build-properties` plugin configures Gradle to use the Google Services plugin
3. Firebase and Google Sign-In will work natively

### For Development (Expo Go)

- Firebase JS SDK works without native configuration
- Google Sign-In uses web-based OAuth flow

### For Production Builds

Native Firebase configuration is automatically applied during build.

## Manual Setup (if needed)

If you run `expo prebuild` and want to manually configure Gradle:

### 1. Root-level build.gradle.kts

Located at `android/build.gradle.kts`:

```kotlin
// Top-level build file
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.1.0")
        // Add the dependency for the Google services Gradle plugin
        classpath("com.google.gms:google-services:4.4.2")
    }
}

plugins {
    id("com.android.application") version "8.1.0" apply false
    // Add the Google services Gradle plugin
    id("com.google.gms.google-services") version "4.4.2" apply false
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
```

### 2. App-level build.gradle.kts

Located at `android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    // Add the Google services Gradle plugin
    id("com.google.gms.google-services")
    // ... other plugins
}

android {
    // ... android config
}

dependencies {
    // Import the Firebase BoM
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    
    // Firebase products you want to use
    // Note: Since you're using Firebase JS SDK, you may not need these
    // But they're useful for native features like Cloud Messaging
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    
    // ... other dependencies
}
```

**Important**: Since you're using Firebase JS SDK (`firebase` package), you don't strictly need the native Firebase dependencies above. However, they can be useful for:
- Better performance on native
- Push notifications (Firebase Cloud Messaging)
- Native authentication flows

## Google Sign-In Client ID

The Google OAuth client ID from `google-services.json`:
```
40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
```

You can use this in your `.env` file:
```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
```

## Building for Android

### Using EAS Build (Recommended)

```bash
# Configure EAS (if not already done)
eas build:configure

# Build for Android
eas build --platform android
```

### Using Expo Prebuild

```bash
# Generate native folders
npx expo prebuild

# The google-services.json will be automatically copied to android/app/
# Gradle files will be automatically configured

# Then build normally
cd android && ./gradlew assembleRelease
```

## Verification

After building, verify that:

1. ✅ `google-services.json` is in `android/app/` (if using prebuild)
2. ✅ Google Sign-In works on Android native builds
3. ✅ Firebase Auth works on Android
4. ✅ No build errors related to Google Services

## Troubleshooting

### Error: "google-services.json not found"

**Solution**: Make sure `google-services.json` is in the project root. Expo will copy it during build.

### Error: "Package name mismatch"

**Solution**: Verify the package name in `google-services.json` matches `app.json`:
- Should be: `app.rork.xpass-multi-gym-fitness-subscription-app`

### Error: "Google Services plugin not applied"

**Solution**: The `expo-build-properties` plugin should handle this automatically. If not, manually add the plugin to `android/app/build.gradle.kts` as shown above.

### Google Sign-In Not Working on Android

**Solutions**:
1. Verify `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is set correctly
2. Check that Google Sign-In is enabled in Firebase Console
3. Ensure the client ID in `google-services.json` matches Firebase Console
4. Try clearing app data and rebuilding

## Current Configuration

- ✅ `google-services.json` configured with correct package name
- ✅ `expo-build-properties` plugin added to `app.json`
- ✅ Google OAuth client ID available: `40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com`

## Next Steps

1. **Test in Expo Go**: Firebase JS SDK should work
2. **Build Development Build**: Test native Firebase features
   ```bash
   eas build --profile development --platform android
   ```
3. **Test Google Sign-In**: Verify it works on native Android
4. **Production Build**: Once verified, create production build

## Additional Resources

- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)
- [Expo Build Properties](https://docs.expo.dev/guides/config-plugins/#expo-build-properties)
- [Google Services Plugin](https://developers.google.com/android/guides/google-services-plugin)







