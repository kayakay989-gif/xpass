# Payment Authentication Debugging Guide

## Issue
Payment form shows "authenticating" status but nothing happens after clicking Pay.

## What I Fixed

1. **Added error handling** in `authenticatePayerMutation.onError`:
   - Now shows Alert dialog on error
   - Resets processing state
   - Clears status message

2. **Added explicit status message** before authentication step

## How to Debug

### Step 1: Check Browser Console (F12)
Look for these log messages:

1. **Before authentication:**
   - `[Payment] Step 2: Authenticating payer...`
   - `[Payment] Calling mutation now...`

2. **After authentication (success):**
   - `[Payment] Authenticate payer mutation success:`
   - `[Payment] Authenticate response:`

3. **If error occurs:**
   - `[Payment] Authenticate payer mutation error:`
   - Red error messages

### Step 2: Check Network Tab (F12 → Network)
1. Look for request to `/trpc/payments.authenticate3ds`
2. Check status:
   - **200 OK** = Request succeeded
   - **500/400** = Server error (check response body)
   - **Pending** = Request hanging (backend issue)

3. Click on the request → **Response** tab to see error message

### Step 3: Check Backend Server Terminal
Look for:
- `[Initiate3DS]` logs
- `[Mastercard]` logs  
- `[tRPC Server] Error on path payments.authenticate3ds`
- Any error messages

## Common Issues & Solutions

### Issue 1: Backend Server Not Running
**Symptoms:** Network request fails or pending forever

**Solution:**
```bash
npm run start-server
```

### Issue 2: Firestore Permissions Error
**Symptoms:** Error message: "Missing or insufficient permissions"

**Solution:** Should be fixed with Admin SDK. Check backend logs for initialization:
```
[Firebase Admin] Initialized successfully with service account key
```

### Issue 3: Mastercard Gateway Error
**Symptoms:** Error from payment gateway API

**Check backend logs for:**
- `[Mastercard] Gateway error:`
- Status codes 400, 401, 403

### Issue 4: Request Hanging
**Symptoms:** Network request shows "pending" forever

**Possible causes:**
- Backend crashed
- Network timeout
- Backend waiting for external service

**Solution:** Check backend terminal for errors, restart server

## What to Share

If you still see the issue, please share:

1. **Browser Console output** (especially errors)
2. **Network tab** - screenshot of the `/trpc/payments.authenticate3ds` request
3. **Backend terminal output** - any error messages

This will help identify exactly where it's failing!




