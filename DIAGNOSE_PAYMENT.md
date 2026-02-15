# Payment Issue Diagnosis

## Quick Checklist

### 1. Is the Backend Server Running?

**Check:**
- Open a terminal and run: `npm run start-server`

**If not running:**
```bash
npm run start-server
```

### 2. Is the API URL Correct?

**Check in browser console (F12):**
- Look for: `[Payment] Starting payment process...`
-- Check the `apiBaseUrl` value - it must be your deployed backend URL

**If wrong:**
- Set environment variable: `EXPO_PUBLIC_RORK_API_BASE_URL=https://xpass-b66g.onrender.com`

### 3. Check Browser Console

**Open DevTools (F12) → Console tab**

**Look for these logs when clicking Pay:**
```
[Payment] Starting payment process...
[Payment] Checking API server connectivity...
[Payment] API server health check: 200
[Payment] Step 1: Initiating 3DS authentication...
[Payment] Mutation state before call: {...}
[tRPC] Making request to: https://xpass-b66g.onrender.com/trpc/payments.initiate3ds
```

**If you see errors:**
- Note the error message
- Check if it's a network error (server not running)
- Check if it's a CORS error
- Check if it's an authentication error

### 4. Check Server Terminal

**In the server terminal, you should see:**
```
[Initiate3DS] Starting authentication for order: order-...
[Mastercard] Making request to: https://YOUR_MPG_HOST/...
```

**If you don't see these:**
- The request isn't reaching the server
- Check if server is actually running
- Check if port 3000 is being used by another process

### 5. Test API Directly

**Open browser and visit:**
- `https://xpass-b66g.onrender.com/` - Should show: `{"status":"ok","message":"API is running"}`
- `https://xpass-b66g.onrender.com/api` - Should show: `{"status":"ok","message":"API endpoint is accessible"}`

**If these don't work:**
- Server is not running
- Port 3000 is blocked
- Firewall is blocking the connection

## Common Issues & Solutions

### Issue: "Cannot connect to API server"
**Solution:** Start the backend server: `npm run start-server`

### Issue: "Network error" or "Failed to fetch"
**Solution:** 
1. Check server is running
2. Check API URL is correct
3. Ensure `EXPO_PUBLIC_RORK_API_BASE_URL` points to a reachable HTTPS backend

### Issue: No logs appearing at all
**Solution:**
1. Check browser console is open (F12)
2. Make sure console filter isn't hiding logs
3. Check if JavaScript errors are blocking execution

### Issue: "CORS error"
**Solution:** 
- Server has CORS enabled, but if you see this, check `backend/hono.ts`
- Make sure `origin: '*'` is set

### Issue: Mutation hangs/freezes
**Solution:**
1. Check server terminal for errors
2. Check if Mastercard gateway is responding
3. Check network tab in DevTools for pending requests

## Step-by-Step Debugging

1. **Start backend server:**
   ```bash
   npm run start-server
   ```

2. **Verify server is running:**
   - Visit: `https://xpass-b66g.onrender.com/`
   - Should see JSON response

3. **Start frontend:**
   ```bash
   npm run start-web
   ```

4. **Open browser DevTools:**
   - Press F12
   - Go to Console tab
   - Go to Network tab

5. **Try payment:**
   - Fill in card details
   - Click Pay
   - Watch both Console and Network tabs

6. **Check what happens:**
   - **Console:** Look for error messages
   - **Network:** Look for requests to `/api/trpc/payments.initiate3ds`
   - **Server terminal:** Look for incoming requests

## What to Share for Help

If payment still doesn't work, share:

1. **Browser Console output** (copy all logs)
2. **Server terminal output** (copy all logs)
3. **Network tab screenshot** (showing the failed request)
4. **Error message** (if any appears in the app)

## Quick Test
Make a request to your deployed backend via the app and inspect the Network tab for failures.

