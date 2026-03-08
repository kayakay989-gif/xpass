# Deployment Guide - Forgot Password Feature

This guide covers deploying the updated app with the forgot password feature to both web and mobile platforms.

## ✅ What's Been Deployed

- ✅ **Web Build**: Exported to `dist/` folder
- ✅ **iOS Build**: Building in background via EAS
- ✅ **Android Build**: Building in background via EAS

## 🌐 Web Deployment

The web build has been exported to the `dist/` folder. You can deploy it using any of these methods:

### Option 1: Firebase Hosting (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting** (if not already done):
   ```bash
   firebase init hosting
   ```
   - Select your Firebase project: `xpass-rork-1e6ad`
   - Public directory: `dist`
   - Configure as single-page app: **Yes**
   - Set up automatic builds: **No** (or Yes if using GitHub)

4. **Deploy**:
   ```bash
   firebase deploy --only hosting
   ```

   Your app will be live at: `https://xpass-rork-1e6ad.web.app`

### Option 2: Vercel

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   cd dist
   vercel --prod
   ```

### Option 3: Netlify

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   cd dist
   netlify deploy --prod --dir=.
   ```

### Option 4: Manual Upload

Upload the contents of the `dist/` folder to any static hosting service:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- Any web server

## 📱 Mobile Deployment

### Check Build Status

1. **View build status**:
   ```bash
   eas build:list
   ```

2. **Monitor builds**:
   - Visit: https://expo.dev/accounts/essa989/projects/xpass-subscription-app/builds
   - Or use: `eas build:view`

### iOS Deployment

Once the iOS build completes:

1. **Download the build**:
   ```bash
   eas build:download --platform ios --latest
   ```

2. **Submit to App Store**:
   ```bash
   eas submit --platform ios
   ```
   
   This will:
   - Upload your app to App Store Connect
   - Guide you through the submission process
   - Require App Store Connect credentials

3. **Or manually submit**:
   - Download the `.ipa` file from EAS
   - Use Xcode or Transporter app to upload to App Store Connect
   - Complete the submission in App Store Connect

### Android Deployment

Once the Android build completes:

1. **Download the build**:
   ```bash
   eas build:download --platform android --latest
   ```

2. **Submit to Google Play**:
   ```bash
   eas submit --platform android
   ```
   
   This will:
   - Upload your app to Google Play Console
   - Guide you through the submission process
   - Require Google Play Console credentials

3. **Or manually submit**:
   - Download the `.aab` or `.apk` file from EAS
   - Upload to Google Play Console
   - Complete the submission in Play Console

## 🔄 Rebuilding After Changes

If you need to rebuild after making changes:

### Web:
```bash
npx expo export --platform web
# Then redeploy using your chosen method above
```

### Mobile:
```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production

# Both
eas build --platform all --profile production
```

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All environment variables are set correctly
- [ ] Firebase configuration is correct
- [ ] API keys are properly configured
- [ ] App version is updated in `app.json`
- [ ] Build number is incremented (iOS: `buildNumber`, Android: `versionCode`)
- [ ] Test the forgot password flow:
  - [ ] "Forgot Password" button appears below Login button
  - [ ] Clicking it navigates to forgot password page
  - [ ] Email validation works
  - [ ] Error messages show "Email invalid" for non-existent emails
  - [ ] Password reset email is sent successfully
  - [ ] Reset password page works with email link

## 🚀 Quick Deploy Commands

### Web (Firebase Hosting):
```bash
npx expo export --platform web
firebase deploy --only hosting
```

### Mobile (EAS):
```bash
# iOS
eas build --platform ios --profile production

# Android  
eas build --platform android --profile production

# Submit after build completes
eas submit --platform ios
eas submit --platform android
```

## 📞 Support

If you encounter issues:
1. Check build logs: `eas build:view`
2. Check EAS status: https://status.expo.dev
3. Review EAS documentation: https://docs.expo.dev/build/introduction/
