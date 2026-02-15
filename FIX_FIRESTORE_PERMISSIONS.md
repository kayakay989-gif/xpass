# Fix Firestore Permissions for Backend

## Problem

The backend server is using the **Firebase Client SDK** (`firebase/firestore`) which requires user authentication. When the backend tries to access Firestore, it gets "Missing or insufficient permissions" errors because:

1. The backend runs on the server (no user authentication context)
2. Firestore security rules require authentication (`request.auth != null`)
3. Client SDK doesn't have admin privileges

## Solution Options

### Option 1: Use Firebase Admin SDK (Recommended for Production)

The backend should use **Firebase Admin SDK** which bypasses security rules and has full access.

**Steps:**

1. **Install Firebase Admin SDK:**
   ```bash
   npm install firebase-admin
   ```

2. **Create service account:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file
   - Save it as `backend/service-account-key.json` (add to `.gitignore`!)

3. **Create Admin Firebase instance:**
   Create `backend/lib/firebase-admin.ts`:
   ```typescript
   import admin from 'firebase-admin';
   import serviceAccount from './service-account-key.json';

   if (!admin.apps.length) {
     admin.initializeApp({
       credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
     });
   }

   export const adminDb = admin.firestore();
   ```

4. **Update Firestore helpers to use Admin SDK:**
   - Create `backend/lib/firestore-admin.ts` similar to `lib/firestore.ts`
   - Use `adminDb` instead of client SDK `db`
   - Update all backend routes to use the admin version

### Option 2: Update Firestore Security Rules (Quick Fix for Development)

**⚠️ Warning: This is NOT secure for production!**

Temporarily allow unauthenticated reads for development:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow reads for development (INSECURE - remove in production!)
    match /{document=**} {
      allow read: if true;  // ⚠️ Allows anyone to read
      allow write: if request.auth != null;
    }
    
    // Production rules (replace above with these):
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
    }
    
    match /subscriptions/{subscriptionId} {
      allow read: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    match /gyms/{gymId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins via backend
    }
    
    match /checkIns/{checkInId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
    }
  }
}
```

**To update rules:**
1. Go to Firebase Console → Firestore Database → Rules
2. Paste the rules above (use the insecure version for development)
3. Click "Publish"

## Recommended Approach

**For Development:**
- Use Option 2 (insecure rules) for quick testing
- Or use Option 1 (Admin SDK) for proper setup

**For Production:**
- MUST use Option 1 (Admin SDK)
- Use proper security rules (not the insecure version)
- Never commit `service-account-key.json` to git

## Current Status

The backend is currently using `lib/firestore.ts` which uses the client SDK. This causes permission errors because the backend doesn't have a user authentication context.

## Next Steps

1. **Immediate Fix:** Update Firestore rules to allow reads (Option 2) for development
2. **Proper Fix:** Implement Firebase Admin SDK (Option 1) for production readiness

