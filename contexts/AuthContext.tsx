import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/types';
import { auth, db } from '@/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  confirmPasswordReset,
} from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { AppleAuthenticationCredential } from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
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
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

// Complete the auth session properly
WebBrowser.maybeCompleteAuthSession();

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Convert Firestore user data to User type
function firestoreDataToUser(id: string, data: any): User {
  // Convert savedCards from Firestore format
  const savedCards = data.savedCards ? data.savedCards.map((card: any) => ({
    id: card.id || '',
    token: card.token || '',
    last4: card.last4 || '',
    brand: card.brand || '',
    expiryMonth: card.expiryMonth || '',
    expiryYear: card.expiryYear || '',
    cardholderName: card.cardholderName || '',
    isDefault: card.isDefault || false,
    createdAt: card.createdAt?.toDate() || new Date(),
  })) : undefined;

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
    savedCards: savedCards,
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
  const [stayLoggedInEnabled, setStayLoggedInEnabledState] = useState<boolean>(false);
  const biometricUnlockPassedRef = useRef<boolean>(false);
  useEffect(() => {
    const loadStayPreference = async () => {
      const raw = await AsyncStorage.getItem('stayLoggedInEnabled');
      setStayLoggedInEnabledState(raw === 'true');
    };
    void loadStayPreference();
  }, []);

  const setStayLoggedInEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    setStayLoggedInEnabledState(enabled);
    await AsyncStorage.setItem('stayLoggedInEnabled', enabled ? 'true' : 'false');
    await AsyncStorage.setItem('biometricLoginEnabled', enabled ? 'true' : 'false');
    if (!enabled) {
      await SecureStore.deleteItemAsync('xpass_biometric_session');
      biometricUnlockPassedRef.current = false;
    }
  }, []);

  const enforceBiometricUnlock = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    if (!stayLoggedInEnabled) return true;
    if (biometricUnlockPassedRef.current) return true;

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      return true;
    }

    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Xpass',
      cancelLabel: 'Use password',
      disableDeviceFallback: false,
    });
    if (!authResult.success) return false;

    biometricUnlockPassedRef.current = true;
    await SecureStore.setItemAsync('xpass_biometric_session', 'ok');
    return true;
  }, [stayLoggedInEnabled]);


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

  // Ensure user profile exists in Firestore (idempotent - safe to call multiple times)
  const ensureUserProfileExists = useCallback(async (
    uid: string,
    email: string,
    name: string,
    phone: string,
    age?: number,
    referralCode?: string,
    referredBy?: string,
    walletBalance: number = 0
  ): Promise<void> => {
    console.log('[AuthContext] STEP: Ensuring user profile exists for:', uid);
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        console.log('[AuthContext] User profile already exists, skipping creation');
        return;
      }
      
      console.log('[AuthContext] Creating new user profile document');
      const newUser: User = {
        id: uid,
        name: name.trim(),
        email: email.toLowerCase(),
        phone: phone || '',
        age: age && !isNaN(age) && age > 0 ? age : undefined,
        referralCode: referralCode || generateReferralCode(),
        referredBy,
        walletBalance,
        createdAt: new Date(),
      };
      
      // Filter out undefined values before saving to Firestore (Firestore doesn't allow undefined)
      const userData: any = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        referralCode: newUser.referralCode,
        walletBalance: newUser.walletBalance,
        createdAt: serverTimestamp(),
      };
      
      // Only include optional fields if they have values
      if (newUser.age !== undefined && newUser.age !== null) {
        userData.age = newUser.age;
      }
      if (newUser.referredBy) {
        userData.referredBy = newUser.referredBy;
      }
      if (newUser.photoUrl) {
        userData.photoUrl = newUser.photoUrl;
      }
      
      await setDoc(userDocRef, userData, { merge: true }); // Use merge to be safe
      
      console.log('[AuthContext] User profile created successfully');
    } catch (error: any) {
      console.error('[AuthContext] Error ensuring user profile:', error);
      // Don't throw - this is non-critical setup
      if (error.code === 'permission-denied') {
        console.warn('[AuthContext] Permission denied creating user profile - will retry on login');
      }
    }
  }, []);

  // Repair incomplete user account (called after login or signup)
  const repairUserAccountIfNeeded = useCallback(async (uid: string, firebaseAuthUser?: FirebaseUser | null) => {
    console.log('[AuthContext] Repairing user account if needed for:', uid);
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log('[AuthContext] User profile missing, creating it now');
        const currentAuthUser = firebaseAuthUser || auth.currentUser;
        if (!currentAuthUser) {
          console.warn('[AuthContext] No auth user available for repair');
          return;
        }
        
        await ensureUserProfileExists(
          uid,
          currentAuthUser.email || '',
          currentAuthUser.displayName || '',
          currentAuthUser.phoneNumber || '',
          undefined,
          generateReferralCode(),
          undefined,
          0
        );
        console.log('[AuthContext] ✅ User profile repaired');
      } else {
        console.log('[AuthContext] User profile exists, no repair needed');
      }
    } catch (error: any) {
      console.error('[AuthContext] Error repairing user account:', error);
      // Non-critical - don't throw
    }
  }, [ensureUserProfileExists]);

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
          
          // Filter out undefined values before saving to Firestore
          const userData: any = {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            referralCode: newUser.referralCode,
            walletBalance: newUser.walletBalance,
            createdAt: serverTimestamp(),
          };
          
          await setDoc(doc(db, 'users', uid), userData);
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
    let authResolved = false;
    const failSafe = setTimeout(() => {
      if (!authResolved) {
        console.warn(
          '[AuthContext] Auth listener did not finish in time — unlocking UI so the app is usable.'
        );
        setIsLoadingAuth(false);
      }
    }, 15000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const biometricAllowed = await enforceBiometricUnlock();
          if (!biometricAllowed) {
            await signOut(auth);
            setFirebaseUser(null);
            setUser(null);
            setIsGuest(false);
            setIsLoadingAuth(false);
            return;
          }

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
          // Unblock UI immediately so membership (tRPC) and home can load in parallel with Firestore profile.
          // Previously we awaited repair + profile + admin here, which serialized ~2–4s+ before the app showed anything.
          setIsLoadingAuth(false);

          void (async () => {
            try {
              await repairUserAccountIfNeeded(firebaseUser.uid, firebaseUser);
              const profile = await loadUserProfile(firebaseUser.uid, firebaseUser);
              if (profile && profile.name && firebaseUser.displayName !== profile.name) {
                try {
                  await updateProfile(firebaseUser, { displayName: profile.name });
                } catch (error) {
                  console.warn('[AuthContext] Failed to sync displayName after profile load:', error);
                }
              }
              await evaluateAdminClaim(firebaseUser);
            } catch (err) {
              console.error('[AuthContext] Background profile / admin load failed:', err);
            }
          })();
        } else {
          setFirebaseUser(null);
          setUser(null);
          setIsGuest(false);
          void evaluateAdminClaim(null).catch((e) =>
            console.warn('[AuthContext] evaluateAdminClaim after sign-out:', e)
          );
        }
      } catch (error) {
        console.error('[AuthContext] Error in auth state change:', error);
      } finally {
        authResolved = true;
        clearTimeout(failSafe);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      clearTimeout(failSafe);
      unsubscribe();
    };
  }, [loadUserProfile, evaluateAdminClaim, repairUserAccountIfNeeded]);

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
      // Prime profile load immediately to reduce auth race conditions on navigation.
      await loadUserProfile(userCredential.user.uid, userCredential.user);
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
  }, [loadUserProfile]);

  // Email/Password Sign Up
  const signUpWithEmail = useCallback(async (
    email: string, 
    password: string, 
    name: string, 
    phone?: string,
    referralCodeUsed?: string,
    age?: number
  ): Promise<void> => {
    console.log('[AuthContext] ========== SIGNUP FLOW START ==========');
    console.log('[AuthContext] STEP 1: Validating input parameters');
    
    // Declare userCredential and tracking variables outside try block
    let userCredential: any = undefined;
    let authUserCreated = false; // Track if Stage A (Auth) succeeded
    let normalizedEmail = '';
    let normalizedPhone = '';
    
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
      
      normalizedEmail = (email || '').trim().toLowerCase();
      // Normalize phone: remove all spaces and non-digit characters except +
      normalizedPhone = phone ? phone.replace(/\s/g, '').trim() : '';
      
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
      
      console.log('[AuthContext] STEP 2: Starting signup for:', normalizedEmail);
      
      // ========== STAGE A: CREATE FIREBASE AUTH USER ==========
      console.log('[AuthContext] STAGE A: Creating Firebase Auth user');
      try {
        userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        authUserCreated = true; // Mark that Stage A succeeded
        console.log('[AuthContext] ✅ STAGE A SUCCESS: Firebase Auth user created:', userCredential.user.uid);
      } catch (authError: any) {
        console.error('[AuthContext] ❌ STAGE A FAILED: Firebase Auth creation error:', {
          code: authError.code,
          message: authError.message
        });
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
      
      // If we get here, Stage A succeeded - Auth user exists
      // From this point on, signup is considered successful even if setup fails
      
      // ========== STAGE B: POST-SIGNUP SETUP (NON-BLOCKING) ==========
      console.log('[AuthContext] STAGE B: Starting post-signup setup (non-blocking)');
      
      // Update display name (non-blocking)
      if (name) {
        try {
          console.log('[AuthContext] STEP 3: Updating display name');
          await updateProfile(userCredential.user, { displayName: name });
          console.log('[AuthContext] ✅ Display name updated');
        } catch (profileError: any) {
          console.warn('[AuthContext] ⚠️ Failed to update display name (non-critical):', profileError.message);
        }
      }

      // Process referral code (non-blocking - optional)
      const normalizedReferral = typeof referralCodeUsed === 'string' ? referralCodeUsed.trim().toUpperCase() : '';
      let referredBy: string | undefined = undefined;
      let initialWalletBalance = 0;

      if (normalizedReferral) {
        try {
          console.log('[AuthContext] STEP 4: Processing referral code:', normalizedReferral);
          const usersRef = collection(db, 'users');
          const referralQuery = query(usersRef, where('referralCode', '==', normalizedReferral), limit(1));
          const referralSnap = await getDocs(referralQuery);
          
          if (!referralSnap.empty) {
            referredBy = normalizedReferral;
            const referrerDoc = referralSnap.docs[0];
            const referrerId = referrerDoc.id;
            
            // Prevent self-referral
            if (referrerId === userCredential.user.uid) {
              console.warn('[AuthContext] ⚠️ User cannot refer themselves, skipping referral reward');
            } else {
              // Save referral linkage only. Reward is granted later after successful paid subscription.
              console.log('[AuthContext] ✅ Referral code accepted; reward will be processed after paid subscription');
            }
          } else {
            console.warn('[AuthContext] ⚠️ Invalid referral code provided, continuing without referral benefits');
          }
        } catch (referralError: any) {
          // Don't fail signup if referral code processing fails
          console.warn('[AuthContext] ⚠️ Error processing referral code (non-critical):', referralError.message);
        }
      }

      // Create/ensure user profile in Firestore (idempotent)
      console.log('[AuthContext] STEP 5: Ensuring user profile exists in Firestore');
      const referralCode = generateReferralCode();
      await ensureUserProfileExists(
        userCredential.user.uid,
        normalizedEmail,
        name,
        normalizedPhone || '',
        age,
        referralCode,
        referredBy,
        initialWalletBalance
      );
      
      console.log('[AuthContext] ✅ STAGE B COMPLETE: Post-signup setup finished');
      console.log('[AuthContext] ========== SIGNUP FLOW SUCCESS ==========');
      
      // Signup is successful - Auth user exists, profile setup completed (or will be repaired on login)
      // Return successfully - don't throw errors for post-auth setup failures
      return;
    } catch (error: any) {
      console.error('[AuthContext] ========== SIGNUP FLOW ERROR ==========');
      console.error('[AuthContext] Error details:', {
        code: error.code,
        message: error.message,
        authUserCreated,
        hasUserCredential: !!userCredential
      });
      
      // CRITICAL: If Stage A (Auth creation) succeeded, signup is considered successful
      // Do NOT delete the Auth user or treat this as signup failure
      if (authUserCreated && userCredential && userCredential.user) {
        console.log('[AuthContext] ⚠️ Auth user was created but post-setup failed');
        console.log('[AuthContext] ✅ Signup is still considered successful - user can login');
        console.log('[AuthContext] Profile setup will be repaired on first login');
        
        // Try to ensure minimum profile exists (non-blocking)
        try {
          await ensureUserProfileExists(
            userCredential.user.uid,
            normalizedEmail,
            name,
            normalizedPhone || '',
            age,
            generateReferralCode(),
            undefined,
            0
          );
        } catch (repairError) {
          console.warn('[AuthContext] Could not repair profile immediately, will retry on login:', repairError);
        }
        
        // Return successfully - Auth user exists, that's what matters
        console.log('[AuthContext] ========== SIGNUP FLOW COMPLETE (with warnings) ==========');
        return;
      }
      
      // If Stage A (Auth creation) failed, this is a real signup failure
      // Only throw errors for actual auth failures
      console.error('[AuthContext] ❌ STAGE A FAILED: Real signup failure - Auth user not created');
      
      // If error already has a user-friendly message, re-throw it
      if (error.message && (
        error.message.includes('already exists') ||
        error.message.includes('Invalid email') ||
        error.message.includes('Password') ||
        error.message.includes('required') ||
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
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to create account. Please try again.');
      }
    }
  }, [ensureUserProfileExists]);

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

  /** Native: call after Google.useAuthRequest succeeds (opens system browser / Custom Tabs). */
  const signInWithApple = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'ios') {
      throw new Error('Sign in with Apple is only available on iOS.');
    }
    const appleSupported = await AppleAuthentication.isAvailableAsync();
    if (!appleSupported) {
      throw new Error('Sign in with Apple is not available on this device.');
    }

    const rawNonce = await (async () => {
      const bytes = await Crypto.getRandomBytesAsync(32);
      const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      let s = '';
      for (let i = 0; i < 32; i++) {
        s += charset[bytes[i] % charset.length];
      }
      return s;
    })();

    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    let appleResult: AppleAuthenticationCredential;
    try {
      appleResult = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        throw new Error('SIGN_IN_CANCELLED');
      }
      throw err;
    }

    const idToken = appleResult.identityToken;
    if (!idToken) {
      throw new Error('Apple did not return an identity token. Please try again.');
    }

    try {
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken,
        rawNonce: rawNonce,
      });
      const userCredential = await signInWithCredential(auth, credential);

      const nameFromApple = appleResult.fullName
        ? AppleAuthentication.formatFullName(appleResult.fullName)
        : '';
      if (nameFromApple && userCredential.user && !userCredential.user.displayName?.trim()) {
        try {
          await updateProfile(userCredential.user, { displayName: nameFromApple });
        } catch (e) {
          console.warn('[AuthContext] Apple displayName update skipped:', e);
        }
      }

      console.log('[AuthContext] Apple login successful:', userCredential.user.uid);
      if (userCredential.user) {
        await loadUserProfile(userCredential.user.uid, userCredential.user);
      }
    } catch (error: any) {
      console.error('[AuthContext] signInWithApple error:', error);
      if (error.code === 'auth/account-exists-with-different-credential') {
        throw new Error(
          'An account already exists with this email. Please sign in with email/password or Google.'
        );
      }
      if (error.code === 'auth/operation-not-allowed') {
        throw new Error(
          'Apple sign-in is not enabled for this app. Please contact support.'
        );
      }
      throw new Error(error?.message || 'Apple sign-in failed.');
    }
  }, [loadUserProfile]);

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string): Promise<void> => {
      if (!idToken?.trim()) {
        throw new Error('Missing Google ID token.');
      }
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        console.log('[AuthContext] Google login successful (native id_token):', userCredential.user.uid);
        if (userCredential.user) {
          await loadUserProfile(userCredential.user.uid);
        }
      } catch (error: any) {
        console.error('[AuthContext] signInWithGoogleIdToken error:', error);
        if (error.code === 'auth/account-exists-with-different-credential') {
          throw new Error('An account already exists with this email. Please use email/password login.');
        }
        throw new Error(error?.message || 'Google sign-in failed.');
      }
    },
    [loadUserProfile]
  );

  /** Web only (Firebase popup). On native use sign-in screen + Google.useAuthRequest. */
  const loginWithGoogle = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'web') {
      throw new Error('Use Continue with Google on this device (opens your browser).');
    }
    try {
      console.log('[AuthContext] Starting Google login (web popup)...');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log('[AuthContext] Google login successful (web):', result.user.uid);
      if (result.user) {
        await loadUserProfile(result.user.uid);
      }
    } catch (error: any) {
      console.error('[AuthContext] Firebase web Google sign-in error:', error);
      let errorMessage = 'Google sign-in failed. Please try again.';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled.';
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email. Please use email/password login.';
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
      setIsAdmin(false);
      setIsGymOwner(false);
      setGymOwnerGymId(null);
      await AsyncStorage.multiRemove(['isGuest', 'stayLoggedInEnabled', 'biometricLoginEnabled']);
      await SecureStore.deleteItemAsync('xpass_biometric_session');
      biometricUnlockPassedRef.current = false;
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
      signInWithGoogleIdToken,
      signInWithApple,
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
      stayLoggedInEnabled,
      setStayLoggedInEnabled,
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
    signInWithGoogleIdToken,
    signInWithApple,
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
    stayLoggedInEnabled,
    setStayLoggedInEnabled,
  ]);
});
