import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@/types';
import { auth, db } from '@/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  confirmPasswordReset,
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  getDocs,
  collection,
  setDoc, 
  updateDoc, 
  query,
  where,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Complete the auth session properly
WebBrowser.maybeCompleteAuthSession();

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Convert Firestore user data to User type
function firestoreDataToUser(id: string, data: any): User {
  return {
    id,
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
    referralCode: data.referralCode || generateReferralCode(),
    referredBy: typeof data.referredBy === 'string' ? data.referredBy : '',
    walletBalance: data.walletBalance || 0,
    createdAt: data.createdAt?.toDate() || new Date(),
    phoneVerified: data.phoneVerified === true,
    phoneVerifiedAt: data.phoneVerifiedAt?.toDate() || undefined,
  };
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState<boolean>(true);
  const [isGymOwner, setIsGymOwner] = useState<boolean>(false);
  const [gymOwnerGymId, setGymOwnerGymId] = useState<string | null>(null);

  const evaluateAdminClaim = useCallback(async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      setIsAdmin(false);
      setIsGymOwner(false);
      setGymOwnerGymId(null);
      setIsCheckingAdmin(false);
      return;
    }
    setIsCheckingAdmin(true);
    try {
      // Admin access is determined by Firestore fields (Option B):
      // - users/{uid}: { role: "admin", status: "active" }
      //
      // Note: we intentionally avoid reading a separate `admins/{uid}` doc to prevent
      // permission errors if Firestore rules were not updated/deployed yet.
      const uid = fbUser.uid;

      const normalize = (v: any) =>
        typeof v === 'string' ? v.trim().toLowerCase() : '';

      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.exists() ? userSnap.data() : null;

      const role = normalize(userData?.role);
      const status = normalize(userData?.status);

      setIsAdmin(role === 'admin' && status === 'active');

      // Gym owner access in this app is handled via a separate username/password portal,
      // so we do not derive gym-owner status from Firebase claims anymore.
      setIsGymOwner(false);
      setGymOwnerGymId(null);
    } catch (error) {
      console.error('[AuthContext] Failed to load admin/gym owner claims:', error);
      setIsAdmin(false);
      setIsGymOwner(false);
      setGymOwnerGymId(null);
    } finally {
      setIsCheckingAdmin(false);
    }
  }, []);

  // Load user profile from Firestore
  const loadUserProfile = useCallback(async (uid: string, firebaseAuthUser?: FirebaseUser | null) => {
    try {
      // Use the passed firebaseAuthUser or get current user
      const currentAuthUser = firebaseAuthUser || auth.currentUser;
      
      // CRITICAL: Verify the UID matches the authenticated user to prevent user switching
      if (currentAuthUser && currentAuthUser.uid !== uid) {
        console.error('[AuthContext] UID mismatch! Expected:', uid, 'Got:', currentAuthUser.uid);
        return null;
      }
      
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (userDoc.exists()) {
        const userData = firestoreDataToUser(uid, userDoc.data());
        
        // Sync Firebase Auth displayName with Firestore if they differ
        if (currentAuthUser && currentAuthUser.displayName !== userData.name && userData.name) {
          try {
            await updateProfile(currentAuthUser, { displayName: userData.name });
          } catch (error) {
            console.warn('[AuthContext] Failed to sync displayName:', error);
          }
        }
        
        setUser(userData);
        return userData;
      } else {
        // Create user profile if it doesn't exist
        // BUT: Check if a user document exists with the same email (might be admin account)
        if (currentAuthUser && currentAuthUser.email) {
          // Check if user exists by email (in case of admin account with different UID)
          const usersRef = collection(db, 'users');
          const emailQuery = query(usersRef, where('email', '==', currentAuthUser.email));
          const emailSnap = await getDocs(emailQuery);
          
          if (!emailSnap.empty) {
            // User exists with same email - this might be an admin account
            // Use the existing user data but update the UID mapping
            const existingUserDoc = emailSnap.docs[0];
            const existingData = existingUserDoc.data();
            const existingUid = existingUserDoc.id;
            
            console.warn(`[AuthContext] User with email ${currentAuthUser.email} exists with UID ${existingUid}, but Firebase Auth has UID ${uid}. This might be an admin account.`);
            
            // If the existing user has admin role, preserve it by updating the existing document
            if (existingData.role === 'admin' && existingData.status === 'active') {
              console.warn(`[AuthContext] Preserving admin account for ${currentAuthUser.email}`);
              // Update existing admin document with new UID reference
              await updateDoc(doc(db, 'users', existingUid), {
                // Keep all existing admin fields
                // Note: This is a workaround - ideally UIDs should match
              });
              // Load the existing admin user
              const adminUser = firestoreDataToUser(existingUid, existingData);
              setUser(adminUser);
              return adminUser;
            }
          }
          
          // No existing user found - create new user profile
          const newUser: User = {
            id: uid,
            name: currentAuthUser.displayName || '',
            email: currentAuthUser.email || '',
            phone: currentAuthUser.phoneNumber || '',
            referralCode: generateReferralCode(),
            walletBalance: 0,
            createdAt: new Date(),
          };
          await setDoc(doc(db, 'users', uid), {
            ...newUser,
            createdAt: serverTimestamp(),
          });
          setUser(newUser);
          return newUser;
        }
      }
    } catch (error: any) {
      console.error('[AuthContext] Error loading user profile:', error);
      // Don't throw error - allow app to continue without user profile
      if (error.code === 'permission-denied') {
        console.warn('[AuthContext] Firestore permission denied - check security rules');
      }
    }
    return null;
  }, []);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // CRITICAL: Verify auth.currentUser matches to prevent race conditions
          const currentUser = auth.currentUser;
          if (currentUser && currentUser.uid !== firebaseUser.uid) {
            console.error('[AuthContext] Auth state mismatch! onAuthStateChanged:', firebaseUser.uid, 'currentUser:', currentUser.uid);
            // Wait a bit and re-check
            await new Promise(resolve => setTimeout(resolve, 100));
            const recheckUser = auth.currentUser;
            if (!recheckUser || recheckUser.uid !== firebaseUser.uid) {
              console.error('[AuthContext] Auth state still mismatched after wait');
              return;
            }
          }
          
          setFirebaseUser(firebaseUser);
          setIsGuest(false);
          // Always load profile from Firestore first (source of truth) - pass firebaseUser to ensure consistency
          const profile = await loadUserProfile(firebaseUser.uid, firebaseUser);
          // If profile loaded successfully, ensure Firebase Auth displayName matches
          if (profile && profile.name && firebaseUser.displayName !== profile.name) {
            try {
              await updateProfile(firebaseUser, { displayName: profile.name });
            } catch (error) {
              console.warn('[AuthContext] Failed to sync displayName after profile load:', error);
            }
          }
          await evaluateAdminClaim(firebaseUser);
        } else {
          setFirebaseUser(null);
          setUser(null);
          setIsGuest(false);
          await evaluateAdminClaim(null);
        }
      } catch (error) {
        console.error('[AuthContext] Error in auth state change:', error);
      } finally {
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [loadUserProfile, evaluateAdminClaim]);

  // Check for guest mode
  useEffect(() => {
    const checkGuestMode = async () => {
      const savedIsGuest = await AsyncStorage.getItem('isGuest');
      if (savedIsGuest === 'true' && !firebaseUser) {
        setIsGuest(true);
      }
    };
    checkGuestMode();
  }, [firebaseUser]);

  const isLoading = isLoadingAuth;

  // Email/Password Login
  const loginWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      const normalizedEmail = (email || '').trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error('Email is required');
      }
      if (!password) {
        throw new Error('Password is required');
      }

      console.log('[AuthContext] Attempting email/password login for:', normalizedEmail);

      // Simple, reliable sign-in – let onAuthStateChanged drive the rest of the flow
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);

      if (!userCredential || !userCredential.user) {
        throw new Error('Login failed: No user returned');
      }

      console.log('[AuthContext] Login successful (Firebase user):', {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
      });
      // onAuthStateChanged listener (set up below) will load the profile and update UI.
    } catch (error: any) {
      console.error('[AuthContext] Login error:', error);
      // Provide more specific error messages
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/user-not-found'
      ) {
        throw new Error('Invalid email or password. Please check your credentials and try again.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address. Please enter a valid email.');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled. Please contact support.');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed login attempts. Please try again later.');
      } else if (error.message) {
        // Re-throw with the original message so UI can display it.
        throw new Error(error.message);
      } else {
        throw new Error('Login failed. Please check your email and password and try again.');
      }
    }
  }, []);

  // Email/Password Sign Up
  const signUpWithEmail = useCallback(async (
    email: string, 
    password: string, 
    name: string, 
    phone?: string,
    referralCodeUsed?: string,
    age?: number
  ): Promise<void> => {
    try {
      // Validate required parameters
      if (!email || !email.trim()) {
        throw new Error('Email is required');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      if (!name || !name.trim()) {
        throw new Error('Name is required');
      }
      
      const normalizedEmail = (email || '').trim().toLowerCase();
      // Normalize phone: remove all spaces and non-digit characters except +
      const normalizedPhone = phone ? phone.replace(/\s/g, '').trim() : '';
      
      // Validate required fields before creating Firebase Auth user
      if (!normalizedEmail || normalizedEmail.length === 0) {
        throw new Error('Email is required');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      if (!name || !name.trim() || name.trim().length === 0) {
        throw new Error('Name is required');
      }
      
      console.log('[AuthContext] Starting signup for:', normalizedEmail);
      
      // Create Firebase Auth user FIRST
      // Firebase Auth will automatically check if email already exists and throw auth/email-already-in-use
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        console.log('[AuthContext] Firebase Auth user created:', userCredential.user.uid);
      } catch (authError: any) {
        console.error('[AuthContext] Firebase Auth creation error:', authError);
        // Map Firebase Auth errors to user-friendly messages
        if (authError.code === 'auth/email-already-in-use') {
          throw new Error('An account with this email already exists. Please login instead.');
        } else if (authError.code === 'auth/invalid-email') {
          throw new Error('Invalid email address. Please enter a valid email.');
        } else if (authError.code === 'auth/weak-password') {
          throw new Error('Password is too weak. Please use a stronger password (at least 6 characters).');
        } else if (authError.code === 'auth/operation-not-allowed') {
          throw new Error('Email/password accounts are not enabled. Please contact support.');
        } else if (authError.code === 'auth/network-request-failed') {
          throw new Error('Network error. Please check your connection and try again.');
        } else {
          throw new Error(authError.message || 'Failed to create account. Please try again.');
        }
      }
      
      // Now check if user already exists in Firestore (edge case: user in Auth but not in Firestore)
      const usersRef = collection(db, 'users');
      try {
        const emailQuery = query(usersRef, where('email', '==', normalizedEmail), limit(1));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
          // User exists in Firestore but we just created Auth user - this is an edge case
          // Delete the Auth user and throw error
          console.warn('[AuthContext] User exists in Firestore but not in Auth - deleting Auth user');
          try {
            await userCredential.user.delete();
          } catch (deleteError) {
            console.error('[AuthContext] Failed to delete Auth user:', deleteError);
          }
          throw new Error('An account with this email already exists. Please login instead.');
        }
        
        // Check by phone if provided
        if (normalizedPhone) {
          const phoneQuery = query(usersRef, where('phone', '==', normalizedPhone), limit(1));
          const phoneSnap = await getDocs(phoneQuery);
          if (!phoneSnap.empty) {
            // User exists with this phone - delete Auth user and throw error
            console.warn('[AuthContext] User exists with phone number - deleting Auth user');
            try {
              await userCredential.user.delete();
            } catch (deleteError) {
              console.error('[AuthContext] Failed to delete Auth user:', deleteError);
            }
            throw new Error('An account with this phone number already exists. Please login instead.');
          }
        }
      } catch (checkError: any) {
        // If it's our custom error, re-throw it
        if (checkError.message && checkError.message.includes('already exists')) {
          throw checkError;
        }
        // If it's a permission error, log it but continue (Firestore rules might allow it)
        if (checkError.code === 'permission-denied') {
          console.warn('[AuthContext] Permission denied checking for existing users, continuing with signup');
        } else {
          // Other errors - log but continue (don't fail signup for Firestore read errors)
          console.warn('[AuthContext] Error checking for existing users, continuing with signup:', checkError);
        }
      }
      
      // Update display name (non-blocking - don't fail signup if this fails)
      if (name) {
        try {
          await updateProfile(userCredential.user, { displayName: name });
          console.log('[AuthContext] Display name updated');
        } catch (profileError) {
          console.warn('[AuthContext] Failed to update display name, continuing with signup:', profileError);
        }
      }

      const normalizedReferral = typeof referralCodeUsed === 'string' ? referralCodeUsed.trim().toUpperCase() : '';
      let referredBy: string | undefined = undefined;
      let initialWalletBalance = 0;

      // Process referral code ONLY for new users (we've already verified user doesn't exist)
      if (normalizedReferral) {
        try {
          const referralQuery = query(usersRef, where('referralCode', '==', normalizedReferral), limit(1));
          const referralSnap = await getDocs(referralQuery);
          
          if (!referralSnap.empty) {
            referredBy = normalizedReferral;
            const referrerDoc = referralSnap.docs[0];
            const referrerId = referrerDoc.id;
            const referrerData = referrerDoc.data();
            const referrerName = referrerData.name || 'Unknown';
            
            // Prevent self-referral
            if (referrerId === userCredential.user.uid) {
              console.warn('[AuthContext] User cannot refer themselves, skipping referral reward');
            } else {
              // Give 10 JOD to the referrer
              const currentBalance = referrerData.walletBalance || 0;
              const newBalance = currentBalance + 10;
              
              // Update referrer's wallet balance
              await updateDoc(doc(db, 'users', referrerId), {
                walletBalance: newBalance,
              });
              
              // Record wallet transaction for referrer
              const walletTransactionRef = doc(collection(db, 'walletTransactions'));
              await setDoc(walletTransactionRef, {
                userId: referrerId,
                type: 'referral_reward',
                amount: 10,
                description: `Referral Reward from ${name}`,
                relatedUserId: userCredential.user.uid,
                createdAt: serverTimestamp(),
              });
              
              // Record referral transaction for admin tracking
              const referralTransactionRef = doc(collection(db, 'referralTransactions'));
              await setDoc(referralTransactionRef, {
                referrerId: referrerId,
                referredUserId: userCredential.user.uid,
                rewardAmount: 10,
                referrerCode: normalizedReferral,
                createdAt: serverTimestamp(),
              });
              
              console.log('[AuthContext] Referral reward processed:', {
                referrerId,
                referredUserId: userCredential.user.uid,
                rewardAmount: 10,
              });
            }
          } else {
            console.warn('[AuthContext] Invalid referral code provided, continuing without referral benefits');
          }
        } catch (referralError) {
          // Don't fail signup if referral code processing fails
          console.warn('[AuthContext] Error processing referral code, continuing without referral benefits:', referralError);
        }
      }

      // Create new user profile in Firestore (we've verified this is a new user)
      const newUser: User = {
        id: userCredential.user.uid,
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone || '',
        age: age && !isNaN(age) && age > 0 ? age : undefined,
        referralCode: generateReferralCode(),
        referredBy,
        walletBalance: initialWalletBalance,
        createdAt: new Date(),
      };

      // Create user document in Firestore
      // The security rule requires request.auth != null && request.auth.uid == userId
      // Since we just created the Firebase Auth user, auth should be available
      console.log('[AuthContext] Creating Firestore user document for:', userCredential.user.uid);
      
      try {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        await setDoc(userDocRef, {
          ...newUser,
          createdAt: serverTimestamp(),
        }, { merge: false });
        console.log('[AuthContext] Firestore user document created successfully');
      } catch (firestoreError: any) {
        console.error('[AuthContext] Firestore document creation error:', firestoreError);
        
        // If Firestore write fails, we need to clean up the Firebase Auth user
        // to prevent orphaned accounts
        try {
          await userCredential.user.delete();
          console.log('[AuthContext] Deleted Firebase Auth user due to Firestore error');
        } catch (deleteError) {
          console.error('[AuthContext] Failed to delete Firebase Auth user after Firestore error:', deleteError);
        }
        
        // Map Firestore errors to user-friendly messages
        if (firestoreError.code === 'permission-denied') {
          throw new Error('Unable to create user profile due to permissions. Please contact support.');
        } else if (firestoreError.code === 'unavailable') {
          throw new Error('Service temporarily unavailable. Please try again in a moment.');
        } else {
          throw new Error('Failed to create user profile. Please try again.');
        }
      }

      // Set user state - this makes the user immediately available in the app
      setUser(newUser);
      console.log('[AuthContext] Sign up successful - user created and available:', {
        uid: userCredential.user.uid,
        email: normalizedEmail,
        name: name.trim()
      });
    } catch (error: any) {
      console.error('[AuthContext] Sign up error (final catch):', error);
      
      // If error already has a user-friendly message, re-throw it
      if (error.message && (
        error.message.includes('already exists') ||
        error.message.includes('Invalid email') ||
        error.message.includes('Password') ||
        error.message.includes('required') ||
        error.message.includes('permissions') ||
        error.message.includes('unavailable') ||
        error.message.includes('Network error')
      )) {
        throw error;
      }
      
      // Map remaining Firebase error codes
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email already exists. Please login instead.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address. Please enter a valid email.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use a stronger password (at least 6 characters).');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('Email/password accounts are not enabled. Please contact support.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your connection and try again.');
      } else if (error.code === 'permission-denied') {
        throw new Error('Unable to create account due to permissions. Please contact support.');
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to create account. Please try again.');
      }
    }
  }, []);

  // Password reset (email-based)
  const resetPassword = useCallback(async (email: string): Promise<void> => {
    try {
      const normalizedEmail = (email || '').trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error('Please enter your email address.');
      }

      await sendPasswordResetEmail(auth, normalizedEmail);
      console.log('[AuthContext] Password reset email sent to:', normalizedEmail);
    } catch (error: any) {
      console.error('[AuthContext] Reset password error:', error);

      if (error.code === 'auth/invalid-email') {
        throw new Error('Email invalid. Please enter a valid email address.');
      }
      if (error.code === 'auth/user-not-found') {
        throw new Error('Email invalid. Please check and try again.');
      }
      if (error.message) {
        throw new Error(error.message);
      }
      throw new Error('Failed to send password reset email. Please try again later.');
    }
  }, []);

  // Confirm password reset with oobCode
  const confirmPasswordResetWithCode = useCallback(async (oobCode: string, newPassword: string): Promise<void> => {
    try {
      if (!oobCode || !oobCode.trim()) {
        throw new Error('Invalid reset code. Please request a new password reset link.');
      }
      if (!newPassword || newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      await confirmPasswordReset(auth, oobCode, newPassword);
      console.log('[AuthContext] Password reset confirmed successfully');
    } catch (error: any) {
      console.error('[AuthContext] Confirm password reset error:', error);

      if (error.code === 'auth/invalid-action-code' || error.code === 'auth/expired-action-code') {
        throw new Error('This password reset link is invalid or has expired. Please request a new one.');
      }
      if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please choose a stronger password.');
      }
      if (error.message) {
        throw new Error(error.message);
      }
      throw new Error('Failed to reset password. Please try again.');
    }
  }, []);

  // Google Login
  const loginWithGoogle = useCallback(async (): Promise<void> => {
    try {
      console.log('[AuthContext] Starting Google login...');
      
      // Google OAuth discovery endpoint
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      // Request configuration
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'myapp', // Match the scheme in app.json
        useProxy: true, // Use Expo's proxy for native
      });

      // Google OAuth Client ID - should be set via environment variable
      // You can get this from Firebase Console > Authentication > Sign-in method > Google
      // Or from Google Cloud Console > APIs & Services > Credentials
      // For web, Firebase handles it automatically, but we can still use env var
      const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 
        '40764236173-nav2vohhco8l6lt7jdng77caklrm5s1l.apps.googleusercontent.com'; // Fallback from google-services.json
      
      if (!googleClientId && Platform.OS !== 'web') {
        console.warn('[AuthContext] Google Client ID not found in env, using fallback');
      }

      // For web, use Firebase's built-in popup method
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        try {
          const result = await signInWithPopup(auth, provider);
          const userCredential = result;
          
          // User profile will be loaded by onAuthStateChanged
          console.log('[AuthContext] Google login successful (web):', userCredential.user.uid);
          
          // Ensure user profile exists
          if (userCredential.user) {
            await loadUserProfile(userCredential.user.uid);
          }
          return;
        } catch (webError: any) {
          console.error('[AuthContext] Firebase web Google sign-in error:', webError);
          throw webError; // Re-throw web errors
        }
      }

      // For native platforms, use expo-auth-session with implicit flow
      // Google OAuth returns id_token in the response with openid scope
      // Generate nonce for security (required for id_token flow)
      const nonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Math.random().toString()
      );

      // Important: disable PKCE for the implicit (id_token) flow to avoid
      // "code_challenge_method not allowed" from Google.
      const request = new AuthSession.AuthRequest({
        clientId: googleClientId!,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.IdToken, // Request id_token directly
        usePKCE: false,
        additionalParameters: {},
        extraParams: {
          nonce: nonce.substring(0, 32), // Google expects nonce in request
        },
      });

      console.log('[AuthContext] Starting OAuth flow for native platform...');
      console.log('[AuthContext] Redirect URI:', redirectUri);

      const result = await request.promptAsync(discovery);

      if (result.type === 'success') {
        const { id_token } = result.params;
        
        if (!id_token) {
          throw new Error('No ID token received from Google. Make sure Google OAuth is properly configured.');
        }

        console.log('[AuthContext] Received Google ID token, signing in to Firebase...');
        
        // Create Firebase credential with Google ID token
        const credential = GoogleAuthProvider.credential(id_token);
        const userCredential = await signInWithCredential(auth, credential);
        
        // User profile will be loaded by onAuthStateChanged
        console.log('[AuthContext] Google login successful (native):', userCredential.user.uid);
        
        // Ensure user profile exists
        if (userCredential.user) {
          await loadUserProfile(userCredential.user.uid);
        }
      } else if (result.type === 'error') {
        const error = result.error;
        console.error('[AuthContext] Google OAuth error:', error);
        
        // Provide helpful error message
        if (error?.error === 'invalid_client') {
          throw new Error('Google OAuth client ID is invalid. Please configure EXPO_PUBLIC_GOOGLE_CLIENT_ID.');
        }
        throw new Error(`Google sign-in failed: ${error?.message || error?.error_description || 'Unknown error'}`);
      } else {
        // User cancelled
        console.log('[AuthContext] Google sign-in cancelled by user');
        throw new Error('Google sign-in was cancelled');
      }
    } catch (error: any) {
      console.error('[AuthContext] Google login error:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Google sign-in failed. Please try again.';
      
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email. Please use email/password login.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }, [loadUserProfile]);

  // Legacy login method (for backward compatibility)
  const login = useCallback(async (newUserId: string): Promise<void> => {
    console.log('[AuthContext] Legacy login method called - consider using loginWithEmail instead');
    // This is kept for backward compatibility but won't work with Firebase
    // The app should migrate to using loginWithEmail or signUpWithEmail
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      console.log('[AuthContext] Logout');
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
      setIsGuest(false);
      await AsyncStorage.removeItem('isGuest');
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
      throw error;
    }
  }, []);

  const updateWalletBalance = useCallback(async (amount: number): Promise<void> => {
    if (!firebaseUser || !user) return;
    try {
      const newBalance = user.walletBalance + amount;
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        walletBalance: newBalance,
      });
      setUser({ ...user, walletBalance: newBalance });
    } catch (error) {
      console.error('[AuthContext] Update wallet error:', error);
      throw error;
    }
  }, [firebaseUser, user]);

  const updateProfileData = useCallback(
    async (updates: { name?: string; phone?: string; email?: string; photoUrl?: string; phoneVerified?: boolean; phoneVerifiedAt?: Date }): Promise<void> => {
      if (!firebaseUser) throw new Error('No authenticated user');
      const userRef = doc(db, 'users', firebaseUser.uid);

      const updatePayload: any = {};
      if (typeof updates.name === 'string') updatePayload.name = updates.name;
      
      // If phone number is changing, reset verification status
      if (typeof updates.phone === 'string') {
        const currentPhone = user?.phone || '';
        if (updates.phone !== currentPhone) {
          // Phone number changed - reset verification
          updatePayload.phone = updates.phone;
          updatePayload.phoneVerified = false;
          updatePayload.phoneVerifiedAt = null;
        } else {
          // Same phone number - keep existing verification status
          updatePayload.phone = updates.phone;
        }
      }
      
      if (typeof updates.email === 'string') updatePayload.email = updates.email;
      if (typeof updates.photoUrl === 'string') updatePayload.photoUrl = updates.photoUrl;
      if (typeof updates.phoneVerified === 'boolean') updatePayload.phoneVerified = updates.phoneVerified;
      if (updates.phoneVerifiedAt instanceof Date) updatePayload.phoneVerifiedAt = serverTimestamp();

      // Update Firestore profile (create if missing)
      if (Object.keys(updatePayload).length > 0) {
        await setDoc(userRef, updatePayload, { merge: true });
      }

      // Keep Firebase auth displayName in sync when provided
      if (updates.name) {
        try {
          await updateProfile(firebaseUser, { displayName: updates.name });
        } catch (err) {
          console.warn('[AuthContext] Unable to update Firebase display name:', err);
        }
      }

      // Optionally keep Firebase auth photoURL in sync
      if (typeof updates.photoUrl === 'string') {
        try {
          await updateProfile(firebaseUser, { photoURL: updates.photoUrl || null });
        } catch (err) {
          console.warn('[AuthContext] Unable to update Firebase photoURL:', err);
        }
      }

      // Update local state
      setUser((prev) => {
        if (!prev) return prev;
        return { 
          ...prev, 
          ...updatePayload,
          phoneVerifiedAt: updates.phoneVerifiedAt || prev.phoneVerifiedAt,
        };
      });
    },
    [firebaseUser]
  );

  const continueAsGuest = useCallback(async () => {
    console.log('[AuthContext] Continue as guest');
    setIsGuest(true);
    await AsyncStorage.setItem('isGuest', 'true');
  }, []);

  return useMemo(() => {
    return {
      user,
      isLoading,
      isAuthenticated: !!user && !!firebaseUser,
      isGuest,
      login,
      loginWithEmail,
      signUpWithEmail,
      loginWithGoogle,
      logout,
      resetPassword,
      confirmPasswordReset: confirmPasswordResetWithCode,
      updateWalletBalance,
      updateProfileData,
      continueAsGuest,
      firebaseUser, // Expose Firebase user for advanced use cases
      isAdmin,
      isCheckingAdmin,
      isGymOwner,
      gymOwnerGymId,
    };
  }, [
    user,
    isLoading,
    isGuest,
    firebaseUser,
    login,
    loginWithEmail,
    signUpWithEmail,
    loginWithGoogle,
    logout,
    resetPassword,
    confirmPasswordResetWithCode,
    updateWalletBalance,
    updateProfileData,
    continueAsGuest,
    isAdmin,
    isCheckingAdmin,
    isGymOwner,
    gymOwnerGymId,
  ]);
});
