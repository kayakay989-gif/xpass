# Production Setup Guide

This guide will help you configure your app for production with full Firebase and Google Maps integration.

## ✅ What's Been Configured

### 1. **Firebase Integration**
- ✅ Firebase Authentication (Email/Password)
- ✅ Firestore Database
- ✅ Error handling and fallbacks
- ✅ Production-ready configuration

### 2. **Google Maps Integration**
- ✅ API key configured
- ✅ Graceful fallback for Expo Go
- ✅ Web and native support
- ✅ Error handling

### 3. **Production Features**
- ✅ Error boundaries for crash prevention
- ✅ Configuration validation
- ✅ Graceful degradation for missing features
- ✅ Expo Go compatibility

## 🔧 Production Configuration Steps

### Step 1: Update Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **xpass-rork-1e6ad**
3. Go to **Project Settings** → **General**
4. Copy the **App ID** from your web app configuration
5. Update `lib/firebase.ts`:

```typescript
appId: "1:40764236173:web:YOUR_ACTUAL_APP_ID"
```

### Step 2: Set Up Firestore Security Rules

1. Go to Firebase Console → **Firestore Database** → **Rules**
2. Add these security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
      allow delete: if false; // Prevent deletion
    }
    
    // Subscriptions collection
    match /subscriptions/{subscriptionId} {
      allow read: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      allow delete: if false;
    }
    
    // Gyms collection (read-only for users)
    match /gyms/{gymId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins via backend
    }
    
    // Check-ins collection
    match /checkIns/{checkInId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

3. Click **Publish**

### Step 3: Enable Firebase Authentication Methods

1. Go to Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Email/Password**
3. (Optional) Enable **Google** for Google sign-in

### Step 4: Configure Google Maps API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **Library**
4. Enable these APIs:
   - ✅ Maps SDK for Android
   - ✅ Maps SDK for iOS
   - ✅ Maps JavaScript API

5. Go to **APIs & Services** → **Credentials**
6. Click on your API key: `AIzaSyAkJ16NXPlpTqFRUrLtlc80jJiTL-j3Tpg`
7. Set **API restrictions**:
   - **Android**: Restrict by package name: `app.rork.xpass-multi-gym-fitness-subscription-app`
   - **iOS**: Restrict by bundle ID: `app.rork.xpass-multi-gym-fitness-subscription-app`
   - **Web**: Restrict by HTTP referrer (your domain)

8. Save changes

### Step 5: Test the App

#### In Expo Go (Current):
```bash
npx expo start
```
- Scan QR code with Expo Go
- **Note**: Maps will show fallback view (maps need dev build)
- Firebase Auth and Firestore should work fully

#### For Production Build:

1. **Install EAS CLI**:
```bash
npm install -g eas-cli
```

2. **Configure EAS**:
```bash
eas build:configure
```

3. **Create Development Build** (to test maps):
```bash
eas build --profile development --platform ios
# or
eas build --profile development --platform android
```

4. **Create Production Build**:
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

## 🐛 Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- ✅ Check `lib/firebase.ts` has correct API key
- ✅ Verify Firebase project is active
- ✅ Check API key restrictions

### "Firestore permission denied"
- ✅ Review security rules above
- ✅ Check user is authenticated
- ✅ Verify rules are published

### "Maps not showing"
- ✅ **In Expo Go**: This is expected - use development build
- ✅ **In dev build**: Check Google Maps API key is correct
- ✅ **On Web**: Check browser console for errors

### "App crashes on startup"
- ✅ Check terminal for error messages
- ✅ Verify all dependencies installed: `npm install`
- ✅ Clear cache: `npx expo start --clear`

## 📱 Testing Checklist

Before deploying to production, test:

- [ ] **Firebase Auth**
  - [ ] Sign up with email/password
  - [ ] Login with email/password
  - [ ] Logout
  - [ ] User profile creation in Firestore

- [ ] **Firestore**
  - [ ] User data saves correctly
  - [ ] Wallet balance updates
  - [ ] Subscriptions create/read
  - [ ] Check-ins create

- [ ] **Google Maps** (in dev build)
  - [ ] Map displays
  - [ ] Markers show gyms
  - [ ] User location works
  - [ ] Info windows display

- [ ] **Error Handling**
  - [ ] App doesn't crash on network errors
  - [ ] Graceful fallbacks work
  - [ ] Error messages are user-friendly

## 🚀 Deploy to Production

### iOS App Store:
```bash
eas build --profile production --platform ios
eas submit --platform ios
```

### Google Play:
```bash
eas build --profile production --platform android
eas submit --platform android
```

### Web:
```bash
eas build --profile production --platform web
eas hosting:deploy
```

## 📝 Important Notes

1. **Expo Go Limitations**:
   - `react-native-maps` doesn't work in Expo Go
   - App shows fallback map view instead
   - All other features work in Expo Go

2. **Development Build Required**:
   - For full maps functionality, create a dev build
   - Use: `eas build --profile development`

3. **Firebase Security**:
   - Never commit API keys to public repos
   - Use environment variables in production
   - Restrict API keys in Google Cloud Console

4. **Google Maps Costs**:
   - Monitor usage in Google Cloud Console
   - Set up billing alerts
   - Review pricing: https://mapsplatform.google.com/pricing/

## 🎉 You're Ready!

Your app is now production-ready with:
- ✅ Full Firebase integration
- ✅ Google Maps support
- ✅ Error handling
- ✅ Production configuration
- ✅ Testing checklist

Need help? Check the error logs or Firebase/Google Cloud Console for detailed error messages.

