# Firebase Admin SDK Setup Complete ✅

## What Was Done

1. **Installed Firebase Admin SDK**
   - Added `firebase-admin` package to the project

2. **Created Firebase Admin Configuration**
   - Created `backend/lib/firebase-admin.ts` to initialize Admin SDK
   - Loads service account key from `backend/service-account-key.json`

3. **Created Admin Firestore Helpers**
   - Created `backend/lib/firestore-admin.ts` with all Firestore operations using Admin SDK
   - Mirrors the client SDK API but uses Admin SDK which bypasses security rules

4. **Updated All Backend Routes**
   - Updated all tRPC routes to use `@/backend/lib/firestore-admin` instead of `@/lib/firestore`
   - This includes:
     - `gyms.list`, `gyms.getById`, `gyms.getCheckIns`, `gyms.getPayments`
     - `subscriptions.getCurrent`, `subscriptions.create`
     - `checkIns.list`, `checkIns.create`
     - All admin routes: `admin.getAllUsers`, `admin.getAllGyms`, `admin.getAllCheckIns`, `admin.getStats`, `admin.createGym`, `admin.deleteGym`
     - `gymOwners.login`

5. **Security**
   - Added `backend/service-account-key.json` to `.gitignore` to prevent committing sensitive credentials

## Files Created/Modified

### New Files:
- `backend/lib/firebase-admin.ts` - Firebase Admin SDK initialization
- `backend/lib/firestore-admin.ts` - Firestore operations using Admin SDK
- `backend/service-account-key.json` - Service account credentials (should NOT be committed)

### Modified Files:
- `.gitignore` - Added service account key patterns
- All backend route files in `backend/trpc/routes/` - Updated imports to use admin SDK

## How It Works

The Admin SDK bypasses Firestore security rules because it has admin privileges. This is the correct approach for backend servers that need to:
- Read/write data without user authentication
- Access all data regardless of security rules
- Perform administrative operations

## Next Steps

1. **Restart the backend server** to apply the changes:
   ```bash
   npm run start-server
   ```

2. **Verify it's working**:
   - Check server logs for: `[Firebase Admin] Initialized successfully with service account key`
   - Try accessing data through the API - you should no longer see "Missing or insufficient permissions" errors

3. **Test the endpoints**:
   - Gyms list should work
   - Subscriptions should load
   - Check-ins should be accessible
   - Admin operations should work

## Important Security Notes

⚠️ **Never commit the service account key to git!**

The file `backend/service-account-key.json` is already in `.gitignore`, but if you ever need to:
- Share the code: Make sure the key file is NOT included
- Deploy to production: Use environment variables instead of the JSON file
- Rotate the key: Generate a new one in Firebase Console and replace the file

## Troubleshooting

If you see errors:

1. **"Service account key not found"**:
   - Make sure `backend/service-account-key.json` exists
   - Check that the file path is correct

2. **"Permission denied"**:
   - The Admin SDK should bypass permissions, but check:
     - Service account key is valid
     - Firebase project ID matches
     - Service account has proper roles in Firebase Console

3. **Import errors**:
   - Make sure all route files are using `@/backend/lib/firestore-admin`
   - Check TypeScript paths are configured correctly in `tsconfig.json`

## Status

✅ Firebase Admin SDK setup complete
✅ All backend routes updated
✅ Service account key configured
✅ Security (gitignore) configured

Your backend should now work without Firestore permission errors!

