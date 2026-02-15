# Quick Fix Guide for Authentication Issues

## Immediate Fixes Applied

### ✅ Fixed: Firebase API Key Typo
- **Changed**: invalid API key prefix to a correct Firebase API key prefix in:
  - `lib/firebase.ts`
  - `lib/config.ts`

### ✅ Fixed: Google Client ID Fallback
- Added fallback Google Client ID from `google-services.json`
- Works even without `.env` file

## What You Need to Do

### 1. Enable Authentication in Firebase (REQUIRED)

Go to [Firebase Console](https://console.firebase.google.com/):

1. Select project: **xpass-rork-1e6ad**
2. Go to **Authentication** → **Sign-in method**
3. Enable **Email/Password**:
   - Click on **Email/Password**
   - Toggle **Enable**
   - Click **Save**
4. Enable **Google** (for Google Sign-In):
   - Click on **Google**
   - Toggle **Enable**
   - Enter project support email
   - Click **Save**

### 2. Create `.env` File (Optional but Recommended)

Create a file named `.env` in the project root (same folder as `package.json`):

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com
```

**Note**: The Google Client ID is already set as a fallback in code, but using `.env` is best practice.

### 3. Restart Development Server

After making changes:

```cmd
# Stop current server (press Ctrl+C)
# Then restart:
npm run start-web
```

## Test the Fixes

### Test Email/Password Login:
1. Go to login page
2. Enter email: `test@example.com`
3. Enter password: `test123456`
4. Click Login

**If user doesn't exist**, try Sign Up first:
1. Click "Sign Up" (or "Don't have an account? Sign Up")
2. Fill all fields
3. Click "Sign Up"

### Test Google Sign-In:
1. Click "Continue with Google"
2. Should open Google sign-in popup
3. Select account
4. Should redirect to home page

## If Still Not Working

### Check Browser Console:
1. Press F12 in browser
2. Go to **Console** tab
3. Try login/sign up
4. Copy any error messages (red text)

### Common Error Messages:

**"Firebase: Error (auth/invalid-api-key)"**
- ✅ Fixed - API key typo corrected
- If still shows, restart server

**"Firebase: Error (auth/email-already-in-use)"**
- User already exists - try login instead

**"Google OAuth Client ID is not configured"**
- ✅ Fixed - fallback added
- Optional: Create `.env` file

**"No base url found"**
- Set `EXPO_PUBLIC_RORK_API_BASE_URL` to your deployed backend URL

**"Firestore permission denied"**
- Check Firestore rules (see PRODUCTION_SETUP.md)

## Summary

✅ **Fixed Issues:**
1. Firebase API key typo
2. Google Client ID fallback added
3. API base URL default added

⚠️ **You Need To:**
1. Enable Email/Password in Firebase Console
2. Enable Google Sign-In in Firebase Console (optional)
3. Restart development server
4. Test login/sign up

## Quick Command to Restart:

```cmd
npm run start-web
```

Then test in browser!







