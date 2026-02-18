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
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
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
    walletBalance: data.walletBalance || 0,
    createdAt: data.createdAt?.toDate() || new Date(),
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
  const loadUserProfile = useCallback(async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = firestoreDataToUser(uid, userDoc.data());
        setUser(userData);
        return userData;
      } else {
        // Create user profile if it doesn't exist
        const firebaseAuthUser = auth.currentUser;
        if (firebaseAuthUser) {
          const newUser: User = {
            id: uid,
            name: firebaseAuthUser.displayName || '',
            email: firebaseAuthUser.email || '',
            phone: firebaseAuthUser.phoneNumber || '',
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
          setFirebaseUser(firebaseUser);
          setIsGuest(false);
          await loadUserProfile(firebaseUser.uid);
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
      const normalizedEmail = (email || '').trim();
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // User profile will be loaded by onAuthStateChanged
      console.log('[AuthContext] Login successful:', userCredential.user.uid);
    } catch (error: any) {
      console.error('[AuthContext] Login error:', error);
      throw error;
    }
  }, []);

  // Email/Password Sign Up
  const signUpWithEmail = useCallback(async (
    email: string, 
    password: string, 
    name: string, 
    phone?: string
  ): Promise<void> => {
    try {
      const normalizedEmail = (email || '').trim();
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      
      // Update display name
      if (name) {
        await updateProfile(userCredential.user, { displayName: name });
      }

      // Create user profile in Firestore
      const newUser: User = {
        id: userCredential.user.uid,
        name,
        email: normalizedEmail,
        phone: phone || '',
        referralCode: generateReferralCode(),
        walletBalance: 0,
        createdAt: new Date(),
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        ...newUser,
        createdAt: serverTimestamp(),
      });

      setUser(newUser);
      console.log('[AuthContext] Sign up successful:', userCredential.user.uid);
    } catch (error: any) {
      console.error('[AuthContext] Sign up error:', error);
      throw error;
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
    async (updates: { name?: string; phone?: string; email?: string; photoUrl?: string }): Promise<void> => {
      if (!firebaseUser) throw new Error('No authenticated user');
      const userRef = doc(db, 'users', firebaseUser.uid);

      const updatePayload: any = {};
      if (typeof updates.name === 'string') updatePayload.name = updates.name;
      if (typeof updates.phone === 'string') updatePayload.phone = updates.phone;
      if (typeof updates.email === 'string') updatePayload.email = updates.email;
      if (typeof updates.photoUrl === 'string') updatePayload.photoUrl = updates.photoUrl;

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
        return { ...prev, ...updatePayload };
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
    updateWalletBalance,
    updateProfileData,
    continueAsGuest,
    isAdmin,
    isCheckingAdmin,
    isGymOwner,
    gymOwnerGymId,
  ]);
});
