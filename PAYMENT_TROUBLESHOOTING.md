# Payment Troubleshooting Guide

## Issue: "Starting authentication" but nothing happens

### Most Common Cause: Backend Server Not Running

The payment API requires the backend server to be running separately.

**Solution:**

1. **Open a new terminal window/tab**

2. **Start the backend server:**
   ```bash
   npm run start-server
   ```

3. **You should see the server running on your configured port**

4. **Keep this terminal running** - don't close it!

5. **In your app build, make sure the API URL is set:**
   - `EXPO_PUBLIC_RORK_API_BASE_URL=https://YOUR_BACKEND_DOMAIN`

### Verify Server is Running

1. Open your browser and visit your backend health endpoint: `https://YOUR_BACKEND_DOMAIN/`
2. You should see a JSON response indicating the server is running

### Check Browser/App Console

1. Open browser DevTools (F12) or check the app logs
2. Look for:
   - `[Payment] Starting payment process...`
   - `[tRPC] Making request to: ...`
   - Any error messages

### Common Issues

#### Issue: "Cannot connect to API server"
- **Cause**: Backend server is not running
- **Fix**: Run `npm run start-server` in a separate terminal

#### Issue: "Network error" or "Failed to fetch"
- **Cause**: Server URL is incorrect or backend is not reachable from the device
- **Fix**:
  - Set `EXPO_PUBLIC_RORK_API_BASE_URL=https://YOUR_BACKEND_DOMAIN`

#### Issue: "Payment gateway is not configured"
- **Cause**: Mastercard gateway credentials missing (but this is already configured)
- **Fix**: Check `backend/lib/mastercard.ts` - credentials are hardcoded

#### Issue: No logs appearing
- **Cause**: Console logs might be filtered or server not receiving requests
- **Fix**: 
  - Check browser console (F12 → Console tab)
  - Check server terminal for `[tRPC]` or `[Mastercard]` logs
  - Make sure you're looking at the right terminal window

## Testing Payment Flow

1. **Start backend server:**
   ```bash
   npm run start-server
   ```

2. **Start frontend app:**
   ```bash
   npm run start-web
   # or
   npm run start
   ```

3. **Navigate to subscription page** and select a plan

4. **Enter test card details:**
   - Card: `5123450000000008`
   - Expiry: `12/25`
   - CVV: `123`
   - Name: Any name

5. **Click Pay** and watch:
   - Browser console (F12)
   - Server terminal
   - App status messages

## Expected Logs

### In Browser/App Console:
```
[Payment] Starting payment process...
[Payment] Step 1: Initiating 3DS authentication...
[tRPC] Making request to: https://YOUR_BACKEND_DOMAIN/trpc/payments.initiate3ds
[tRPC] Response status: 200
[Payment] Initiate response: {...}
```

### In Server Terminal:
```
[Initiate3DS] Starting authentication for order: order-...
[Mastercard] Response status: 200
```

## Still Not Working?

1. **Check both terminals are running:**
   - Frontend terminal (Expo)
   - Backend terminal (server)

2. **Verify API URL:**
   - Open browser DevTools → Network tab
   - Try to make payment
   - Look for failed requests to `/api/trpc/`

3. **Check server logs:**
   - Look for any error messages in the server terminal
   - Check if Mastercard gateway calls are being made

4. **Restart both servers:**
   - Stop both terminals (Ctrl+C)
   - Start backend: `npm run start-server`
   - Start frontend: `npm run start-web`

