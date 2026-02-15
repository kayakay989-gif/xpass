# Firebase Integration Guide

This app has been integrated with Firebase Authentication and Firestore Database.

## What's Been Integrated

### 1. Firebase Authentication
- **Email/Password Authentication**: Users can sign up and login with email and password
- **Google Authentication**: Placeholder for Google OAuth (requires additional setup)
- **Automatic Session Persistence**: User sessions are automatically persisted

### 2. Firestore Database
- **User Profiles**: Stored in `users` collection
- **Subscriptions**: Stored in `subscriptions` collection
- **Gyms**: Stored in `gyms` collection
- **Check-ins**: Stored in `checkIns` collection

## Firebase Configuration

The Firebase configuration is located in `lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "AlzaSyB5Sa5PqdEWbUPI-tyBLyywcLM6DbmTkDc",
  authDomain: "xpass-rork-1e6ad.firebaseapp.com",
  projectId: "xpass-rork-1e6ad",
  storageBucket: "xpass-rork-1e6ad.firebasestorage.app",
  messagingSenderId: "40764236173",
  appId: "1:40764236173:web:your-app-id", // Update this from Firebase Console
};
```

**Note**: You may need to get the actual `appId` from your Firebase Console project settings.

## Usage

### Authentication

The `AuthContext` provides the following methods:

```typescript
const { 
  loginWithEmail,      // Login with email/password
  signUpWithEmail,     // Sign up with email/password
  loginWithGoogle,     // Google login (requires setup)
  logout,              // Sign out
  user,                // Current user data
  isAuthenticated,     // Boolean indicating if user is logged in
  isLoading,          // Loading state
} = useAuth();
```

#### Example: Sign Up
```typescript
await signUpWithEmail(email, password, name, phone);
```

#### Example: Login
```typescript
await loginWithEmail(email, password);
```

#### Example: Logout
```typescript
await logout();
```

### Firestore Database

The Firestore service is available in `lib/firestore.ts`:

```typescript
import firestore from '@/lib/firestore';

// Get user by ID
const user = await firestore.users.getById(userId);

// Update user
await firestore.users.update(userId, { walletBalance: 100 });

// Get user's subscription
const subscription = await firestore.subscriptions.getByUserId(userId);

// Create check-in
await firestore.checkIns.create({
  id: 'checkin-123',
  userId: 'user-123',
  gymId: 'gym-123',
  timestamp: new Date(),
  subscriptionId: 'sub-123',
});
```

## Firestore Security Rules

You'll need to set up Firestore security rules in your Firebase Console. Here's a basic example:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Subscriptions collection
    match /subscriptions/{subscriptionId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    // Check-ins collection
    match /checkIns/{checkInId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
    
    // Gyms collection
    match /gyms/{gymId} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins can write (use Cloud Functions)
    }
  }
}
```

## Next Steps

1. **Update appId**: Get your actual `appId` from Firebase Console and update `lib/firebase.ts`

2. **Set up Firestore Security Rules**: Add the security rules above to your Firebase Console

3. **Enable Authentication Methods**: In Firebase Console → Authentication → Sign-in method, enable:
   - Email/Password
   - Google (if you want Google login)

4. **Create Firestore Collections**: The collections will be created automatically when you write data, but you can also create them manually in Firebase Console

5. **Migrate Existing Data** (if any): If you have existing data in your old database, you'll need to migrate it to Firestore

6. **Set up Google OAuth** (optional): To enable Google login:
   ```bash
   npm install expo-auth-session expo-crypto
   ```
   Then update `contexts/AuthContext.tsx` to implement the Google OAuth flow.

## Testing

1. Test sign up with a new email
2. Test login with the created account
3. Verify user profile is created in Firestore
4. Test logout functionality
5. Test wallet balance updates

## Troubleshooting

### "Firebase: Error (auth/invalid-api-key)"
- Check that your `apiKey` in `lib/firebase.ts` matches your Firebase project

### "Firebase: Error (auth/domain-not-authorized)"
- Add your domain to Firebase Console → Authentication → Settings → Authorized domains

### "Missing or insufficient permissions"
- Check your Firestore security rules in Firebase Console

### Auth state not persisting
- Firebase Auth automatically persists in React Native/Expo
- If issues persist, check AsyncStorage permissions

## Migration from Old Auth System

The old authentication system using tRPC has been replaced with Firebase Auth. The following changes were made:

- `AuthContext` now uses Firebase Auth instead of tRPC
- Login screen uses `loginWithEmail` and `signUpWithEmail` instead of tRPC mutations
- User data is stored in Firestore instead of in-memory database
- Authentication state is managed by Firebase Auth instead of AsyncStorage

The app maintains backward compatibility where possible, but you should update any components that directly call the old auth methods.

