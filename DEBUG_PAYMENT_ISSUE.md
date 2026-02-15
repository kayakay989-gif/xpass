# Debug Payment Authentication Issue

## Problem
User enters payment data, clicks Pay, sees "authenticating" status, but nothing happens after that.

## What to Check

### 1. Browser Console
Open browser DevTools (F12) → Console tab and look for:
- `[Payment] Step 2: Authenticating payer...`
- `[Payment] Authenticate payer mutation error:` (if there's an error)
- `[Payment] Authenticate response:`
- Any red error messages

### 2. Network Tab
Open DevTools → Network tab:
- Look for request to `/trpc/payments.authenticate3ds`
- Check if it's pending (hanging) or if it returned an error
- Check the response status code and body

### 3. Backend Server Logs
Check the backend server terminal for:
- `[Initiate3DS]` logs
- `[Mastercard]` logs
- Any error messages
- `[tRPC Server] Error on path payments.authenticate3ds`

### 4. Common Issues

#### A. Backend Server Not Running
- Make sure `npm run start-server` is running
- Check that your backend URL is configured via `EXPO_PUBLIC_RORK_API_BASE_URL`

#### B. Firestore Permissions (Should be fixed now)
- Backend should use Admin SDK
- Check for "Missing or insufficient permissions" errors

#### C. Mastercard Gateway Errors
- Check for 400/401/403 errors from Mastercard gateway
- Look for error messages about invalid credentials or requests

#### D. Missing Method HTML
- The initiate step might succeed but not return methodHtml
- Check logs for `hasMethodHtml: true/false`

#### E. Authentication Step Failing
- The authenticate step might be throwing an error
- Check backend logs for authentication errors

## Quick Fixes Applied

1. Added better error handling in `authenticatePayerMutation.onError`
2. Added explicit status message update before authentication step
3. Errors should now show alerts to the user

## Next Steps

1. **Check the browser console** - Look for error messages
2. **Check backend logs** - See what's happening on the server
3. **Share the error messages** - Copy any error messages you see




