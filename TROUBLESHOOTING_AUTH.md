# Troubleshooting Authentication Issues

## Issues Found and Fixed

### ✅ Fixed: Firebase API Key Typo
- **Problem**: API key had typo `AlzaSy` instead of `AIzaSy`
- **Fixed**: Corrected in `lib/firebase.ts` and `lib/config.ts`

## Common Issues and Solutions

### Issue 1: "Email/Password Login Not Working"

**Symptoms:**
- Login button does nothing
- Error messages appear
- App crashes on login

**Solutions:**

1. **Check Firebase is enabled:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select project: `xpass-rork-1e6ad`
   - Go to **Authentication** → **Sign-in method**
   - Ensure **Email/Password** is **Enabled**

2. **Check Firebase API Key:**
   - Verify in `lib/firebase.ts` the API key is correct
   - Should start with `AIzaSy...` (not `AlzaSy`)

3. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Check Console tab for errors
   - Look for Firebase-related errors

4. **Verify Network Connection:**
   - Ensure you have internet connection
   - Firebase requires network access

### Issue 2: "Google Sign-In Not Working"

**Symptoms:**
- Google button shows error
- "Client ID not configured" error
- Popup doesn't open

**Solutions:**

1. **Create `.env` file in project root:**
   ```env
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
   ```

2. **Enable Google Sign-In in Firebase:**
   - Firebase Console → **Authentication** → **Sign-in method**
   - Click on **Google**
   - Click **Enable**
   - Enter support email
   - Click **Save**

3. **For Web:**
   - Google Sign-In should work automatically once enabled in Firebase
   - No client ID needed for web

4. **Restart Development Server:**
   After creating `.env` file:
   ```cmd
   # Stop current server (Ctrl+C)
   # Then restart:
   npm run start-web
   ```

### Issue 3: "Sign Up Not Working"

**Symptoms:**
- Sign up button does nothing
- Error: "Failed to create account"

**Solutions:**

1. **Check Firebase Console:**
   - Ensure Email/Password authentication is enabled
   - Check Firebase project is active

2. **Check Firestore Rules:**
   - Firebase Console → **Firestore Database** → **Rules**
   - Ensure users can create their profile:
   ```javascript
   match /users/{userId} {
     allow create: if request.auth != null && request.auth.uid == userId;
   }
   ```

3. **Check Browser Console:**
   - Look for specific error messages
   - Common errors:
     - `auth/email-already-in-use` - Email already registered
     - `auth/weak-password` - Password too weak
     - `auth/invalid-email` - Invalid email format

### Issue 4: "Pages Don't Load / App Crashes"

**Symptoms:**
- Login page doesn't render
- App crashes on startup
- White screen

**Solutions:**

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Check Console for errors
   - Look for React/Expo errors

2. **Clear Cache and Restart:**
   ```cmd
   npx expo start --web --clear
   ```

3. **Check Dependencies:**
   ```cmd
   npm install
   ```

4. **Verify Firebase Initialization:**
   - Check `lib/firebase.ts` has correct config
   - API key should start with `AIzaSy`
   - All fields should be filled

## Step-by-Step Debugging

### Step 1: Check Browser Console
1. Open app in browser
2. Press F12 to open DevTools
3. Go to **Console** tab
4. Look for errors (red text)
5. Share error messages for help

### Step 2: Verify Firebase Configuration
1. Check `lib/firebase.ts`:
   - Firebase config must come from `EXPO_PUBLIC_FIREBASE_*` env vars
   - No Firebase API keys should be hardcoded in the repo

2. Check Firebase Console:
   - Project ID: `xpass-rork-1e6ad`
   - Authentication enabled
   - Email/Password enabled
   - Google Sign-In enabled (if using)

### Step 3: Create .env File
Create `.env` in project root:
```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
```

### Step 4: Restart Server
After any changes:
```cmd
# Stop server (Ctrl+C)
npm run start-web
```

## Testing Checklist

- [ ] Firebase API key is correct (starts with `AIzaSy`)
- [ ] `.env` file exists with Google Client ID (for native)
- [ ] Email/Password auth enabled in Firebase Console
- [ ] Google Sign-In enabled in Firebase Console (if using)
- [ ] Browser console shows no errors
- [ ] Network connection is working
- [ ] Firestore rules allow user creation
- [ ] Development server restarted after changes

## Quick Test Commands

```cmd
# Test in web browser
npm run start-web

# Clear cache and restart
npx expo start --web --clear

# Check for errors
# Open browser console (F12) and look for errors
```

## Still Having Issues?

1. **Check Browser Console:**
   - Copy exact error messages
   - Take screenshot if possible

2. **Check Network Tab:**
   - Open DevTools → Network tab
   - Try login/sign up
   - Look for failed requests (red)
   - Check request URLs

3. **Verify Firebase Status:**
   - Go to Firebase Console
   - Check project is active
   - Check Authentication is enabled
   - Check Firestore is enabled

4. **Test with Simple Credentials:**
   - Email: `test@example.com`
   - Password: `test123456` (at least 6 characters)

## Expected Behavior

### Login Flow:
1. Enter email and password
2. Click "Login" button
3. Loading indicator shows
4. Redirects to home page on success
5. Shows error message on failure

### Sign Up Flow:
1. Switch to "Sign Up" mode
2. Fill all fields (name, email, phone, password)
3. Click "Sign Up" button
4. Loading indicator shows
5. Success alert shows
6. Redirects to home page
7. User profile created in Firestore

### Google Sign-In Flow:
1. Click "Continue with Google"
2. (Web) Popup opens for Google sign-in
3. (Native) Browser opens for Google sign-in
4. Select Google account
5. Redirects to home page on success







