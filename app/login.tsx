import { StyleSheet, Text, View, TouchableOpacity, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  CheckSquare,
  ChevronLeft,
  Eye,
  EyeOff,
  Gift as GiftIcon,
  Lock,
  Mail,
  Square,
  User,
} from 'lucide-react-native';
import {
  GOOGLE_CONFIG,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  getGoogleNativeOAuthRedirectUri,
} from '@/constants/googleOAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc } from '@/lib/trpc';
import { scheduleAuthNavigation } from '@/lib/schedule-navigation';
import {
  isValidMemberAge,
  MIN_MEMBER_AGE,
} from '@/lib/profile-validation';
import { agentLog } from '@/lib/agent-debug-log';
import Colors from '@/constants/colors';
import { useAuth, PENDING_REFERRAL_STORAGE_KEY } from '@/contexts/AuthContext';
import Toast from '@/components/Toast';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  isAvailableAsync as isAppleAuthAvailableAsync,
} from 'expo-apple-authentication';

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, signUpWithEmail, loginWithGoogle, signInWithGoogleIdToken, signInWithApple, logout, isAdmin, stayLoggedInEnabled, setStayLoggedInEnabled } = useAuth();
  const applyReferralMutation = trpc.users.applyReferralCode.useMutation();
  const params = useLocalSearchParams<{ mode?: string; ref?: string }>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('login');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [appleSignInUnavailableReason, setAppleSignInUnavailableReason] = useState<string>('');
  
  // Validation error states
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    age?: string;
    password?: string;
  }>({});
  
  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  WebBrowser.maybeCompleteAuthSession();

  const googleIdTokenHandledRef = useRef<string | null>(null);
  const googleIosClientId = GOOGLE_CONFIG.iosClientId?.trim() || '';
  const isGoogleClientConfigValid = Platform.OS !== 'ios' || !!googleIosClientId;

  // iOS: `IdToken` avoids fragile code-exchange paths with Google's native client.
  // Android: `Code` + PKCE (library exchanges for tokens and surfaces id_token for Firebase).
  // Use Google's reversed-client scheme directly. makeRedirectUri({ native }) only applies that
  // value in Standalone/Bare; other environments would fall back to the app scheme and break OAuth.
  const googleOAuthRedirectUri = getGoogleNativeOAuthRedirectUri();
  const nativeGoogleResponseType: ResponseType | undefined =
    Platform.OS === 'web'
      ? undefined
      : ResponseType.Code;
  const [googleAuthRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: googleIosClientId || undefined,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    ...(nativeGoogleResponseType ? { responseType: nativeGoogleResponseType } : {}),
    ...(googleOAuthRedirectUri ? { redirectUri: googleOAuthRedirectUri } : {}),
  });
  // #region agent log
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const url = googleAuthRequest?.url;
    let urlResponseType: string | null = null;
    let redirectUriHost = '';
    let redirectInUrl = false;
    try {
      if (url) {
        const parsed = new URL(url);
        urlResponseType = parsed.searchParams.get('response_type');
        const ru = parsed.searchParams.get('redirect_uri');
        redirectInUrl = !!ru;
        if (ru) {
          try {
            redirectUriHost = new URL(decodeURIComponent(ru)).hostname;
          } catch {
            redirectUriHost = 'decode_or_parse_err';
          }
        }
      }
    } catch {
      urlResponseType = 'url_parse_err';
    }
    const payload = {
      sessionId: '4fc1bb',
      runId: 'post-fix',
      hypothesisId: 'H1-H5',
      location: 'login.tsx:googleOAuthInstrument',
      message: 'native google auth request snapshot',
      data: {
        platform: Platform.OS,
        responseTypeEnum: nativeGoogleResponseType ?? null,
        redirectFromGetGoogleNative: googleOAuthRedirectUri ?? null,
        webClientIdEnvLen: (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').length,
        hasAuthUrl: !!url,
        urlResponseType,
        redirectInUrl,
        redirectUriHost,
        hasGoogleAuthRequest: !!googleAuthRequest,
      },
      timestamp: Date.now(),
    };
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        console.log('[agent-4fc1bb]', JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
    fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc1bb' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [
    googleAuthRequest?.url,
    googleOAuthRedirectUri,
    nativeGoogleResponseType,
    googleAuthRequest,
  ]);
  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'error' && googleResponse.type !== 'dismiss') return;
    const p = googleResponse.params as Record<string, unknown> | undefined;
    const err = typeof p?.error === 'string' ? p.error : '';
    const ed =
      typeof p?.error_description === 'string' ? String(p.error_description).slice(0, 160) : '';
    const payload2 = {
      sessionId: '4fc1bb',
      runId: 'post-fix',
      hypothesisId: 'H4',
      location: 'login.tsx:googleResponseError',
      message: 'google auth session response non-success',
      data: {
        responseType: googleResponse.type,
        oauthError: err,
        errorDescSnippet: ed,
      },
      timestamp: Date.now(),
    };
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        console.log('[agent-4fc1bb]', JSON.stringify(payload2));
      } catch {
        /* ignore */
      }
    }
    fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4fc1bb' },
      body: JSON.stringify(payload2),
    }).catch(() => {});
  }, [googleResponse]);
  // #endregion
  const isGoogleButtonAvailable =
    isGoogleClientConfigValid &&
    (Platform.OS === 'web' ? true : !!googleAuthRequest);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (googleResponse?.type !== 'success') return;
    const idToken =
      (googleResponse.params?.id_token as string | undefined) ||
      (googleResponse.params as any)?.id_token ||
      ((googleResponse as any).authentication?.idToken as string | undefined);
    if (!idToken || googleIdTokenHandledRef.current === idToken) return;
    googleIdTokenHandledRef.current = idToken;
    (async () => {
      try {
        setIsLoading(true);
        await signInWithGoogleIdToken(idToken, {
          referralCode: referral.trim() || undefined,
        });
        const refTrim = referral.trim();
        if (refTrim) {
          let linkedOk = false;
          for (let attempt = 0; attempt < 8; attempt++) {
            try {
              const res = await applyReferralMutation.mutateAsync({ code: refTrim });
              if (res.ok) {
                linkedOk = true;
                break;
              }
              if (!res.ok && res.reason === 'no_profile' && attempt < 7) {
                await new Promise((r) => setTimeout(r, 450 + attempt * 120));
                continue;
              }
              break;
            } catch (refErr) {
              console.warn('[Login] applyReferralCode after Google attempt', attempt + 1, refErr);
              if (attempt < 7) {
                await new Promise((r) => setTimeout(r, 450 + attempt * 120));
              }
            }
          }
          if (!linkedOk) {
            await AsyncStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, refTrim.toUpperCase());
          }
        }
        // #region agent log
        agentLog('H1', 'login.tsx:googleNative', 'schedule_auth_nav', { target: '/home' });
        // #endregion
        scheduleAuthNavigation((href) => router.replace(href as any), '/(tabs)/home');
      } catch (e: any) {
        googleIdTokenHandledRef.current = null;
        console.error('Google Sign-In Error:', e?.code, e?.message);
        Alert.alert('Error', e?.message || 'Google sign-in failed.');
        setIsLoading(false);
      }
      /* Keep spinner until login unmounts on successful nav — avoids blank/404 flash */
    })();
  }, [googleResponse, signInWithGoogleIdToken, router, referral, applyReferralMutation]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void isAppleAuthAvailableAsync().then((available) => {
      setAppleAuthAvailable(available);
      if (!available) {
        setAppleSignInUnavailableReason('Apple Sign-In currently unavailable');
      }
    });
  }, []);

  useEffect(() => {
    const m = typeof params.mode === 'string' ? params.mode.trim().toLowerCase() : '';
    const r = typeof params.ref === 'string' ? params.ref.trim().toUpperCase() : '';
    if (m === 'signup') setMode('signup');
    if (r) {
      setReferral(r);
      void AsyncStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, r);
    }
  }, [params.mode, params.ref]);

  const validateEmailFormat = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim().toLowerCase());
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    // Validate email
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmailFormat(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Validate age
    if (!age.trim()) {
      newErrors.age = 'Age is required';
    } else {
      const ageNum = parseInt(age, 10);
      if (isNaN(ageNum) || !isValidMemberAge(ageNum)) {
        newErrors.age = `Please enter a valid age (${MIN_MEMBER_AGE}+)`;
      }
    }

    // Validate password
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async () => {
    // Clear previous errors
    setErrors({});

    // Validate form
    if (!validateForm()) {
      setToast({
        visible: true,
        message: 'Please fill all required fields correctly',
        type: 'error',
      });
      return;
    }

    // Additional validation before calling signup
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedAge = age.trim();
    const ageNum = parseInt(trimmedAge, 10);

    if (!trimmedName) {
      setErrors({ name: 'Name is required' });
      setToast({
        visible: true,
        message: 'Please enter your full name',
        type: 'error',
      });
      return;
    }

    if (!trimmedEmail) {
      setErrors({ email: 'Email is required' });
      setToast({
        visible: true,
        message: 'Please enter your email address',
        type: 'error',
      });
      return;
    }

    if (!trimmedAge || isNaN(ageNum) || !isValidMemberAge(ageNum)) {
      setErrors({ age: `Age is required (minimum ${MIN_MEMBER_AGE})` });
      setToast({
        visible: true,
        message: 'Please enter a valid age',
        type: 'error',
      });
      return;
    }

    if (!password || password.length < 6) {
      setErrors({ password: 'Password is required' });
      setToast({
        visible: true,
        message: 'Password must be at least 6 characters',
        type: 'error',
      });
      return;
    }

    setIsLoading(true);
    setErrors({}); // Clear any previous errors
    
    try {
      console.log('[Login] Starting signup process');
      await signUpWithEmail(
        trimmedEmail, 
        password, 
        trimmedName, 
        undefined,
        referral.trim() || undefined, 
        ageNum
      );

      const refTrim = referral.trim();
      if (refTrim) {
        let linkedOk = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const res = await applyReferralMutation.mutateAsync({ code: refTrim });
            if (res.ok) {
              linkedOk = true;
              break;
            }
            if (!res.ok && res.reason === 'no_profile' && attempt < 7) {
              await new Promise((r) => setTimeout(r, 450 + attempt * 120));
              continue;
            }
            break;
          } catch (refErr) {
            console.warn('[Login] applyReferralCode attempt', attempt + 1, refErr);
            if (attempt < 7) {
              await new Promise((r) => setTimeout(r, 450 + attempt * 120));
            }
          }
        }
        if (!linkedOk) {
          await AsyncStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, refTrim.toUpperCase());
        }
      }

      console.log('[Login] Signup successful - showing success and redirecting');
      
      // Signup succeeded - show success message
      setToast({
        visible: true,
        message: 'Account created successfully! You can now log in.',
        type: 'success',
      });

      // Clear form
      setName('');
      setEmail('');
      setAge('');
      setPassword('');
      setReferral('');
      setErrors({});
      
      // Switch to login mode
      setMode('login');
      
      // Logout and redirect after a brief delay to show success message
      setTimeout(async () => {
        try {
          await logout();
          console.log('[Login] Logged out after signup');
        } catch (e) {
          console.warn('[Login] Logout after signup failed (continuing anyway):', e);
        }
        
        // Redirect to login page
        router.replace('/login');
      }, 2000);
    } catch (error: any) {
      console.error('[Login] Signup error:', error);
      
      // Extract error message - AuthContext already provides user-friendly messages
      const errorMessage = error.message || 'Failed to create account. Please try again.';
      
      // Show error toast
      setToast({
        visible: true,
        message: errorMessage,
        type: 'error',
      });
      
      // Set inline errors based on error message content
      const lowerMessage = errorMessage.toLowerCase();
      const newErrors: Record<string, string> = {};
      
      if (lowerMessage.includes('email')) {
        newErrors.email = errorMessage;
      } else if (lowerMessage.includes('password')) {
        newErrors.password = errorMessage;
      } else if (lowerMessage.includes('name')) {
        newErrors.name = errorMessage;
      } else if (lowerMessage.includes('age')) {
        newErrors.age = errorMessage;
      } else {
        // General error - show at top of form
        newErrors.general = errorMessage;
      }
      
      setErrors(newErrors);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      const msg = 'Please enter your email and password';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    if (!validateEmailFormat(email)) {
      const msg = 'Please enter a valid email address.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    setIsLoading(true);
    let willNavigate = false;
    try {
      await loginWithEmail(email.trim(), password);
      console.log('[Login] Email/password login successful, navigating to home');
      const target = isAdmin ? '/admin-dashboard' : '/(tabs)/home';
      // #region agent log
      agentLog('H1', 'login.tsx:emailLogin', 'schedule_auth_nav', { target });
      // #endregion
      scheduleAuthNavigation((href) => router.replace(href as any), target);
      willNavigate = true;
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Invalid credentials. Please try again.';
      
      if (error.code) {
        if (
          error.code === 'auth/user-not-found' ||
          error.code === 'auth/wrong-password' ||
          error.code === 'auth/invalid-credential'
        ) {
          errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.code === 'auth/user-disabled') {
          errorMessage = 'This account has been disabled.';
        } else {
          errorMessage = error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      if (!willNavigate) setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isGoogleButtonAvailable) {
      Alert.alert('Google Sign-In currently unavailable');
      return;
    }
    if (Platform.OS === 'web') {
      setIsLoading(true);
      let willNavigate = false;
      try {
        await loginWithGoogle();
        // #region agent log
        agentLog('H1', 'login.tsx:googleWeb', 'schedule_auth_nav', { target: '/home' });
        // #endregion
        scheduleAuthNavigation((href) => router.replace(href as any), '/(tabs)/home');
        willNavigate = true;
      } catch (error: any) {
        console.error('Google Sign-In Error:', error?.code, error?.message);
        let errorMessage = 'Google sign-in failed. Please try again.';
        if (error.message) {
          errorMessage = error.message;
        } else if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('cancelled')) {
          errorMessage = 'Sign-in was cancelled.';
        }
        if (typeof window !== 'undefined') {
          window.alert(errorMessage);
        } else {
          Alert.alert('Error', errorMessage);
        }
      } finally {
        if (!willNavigate) setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    let keepLoadingForNativeCallback = false;
    try {
      const result = await googlePromptAsync({ showInRecents: true });
      if (result.type === 'success') {
        // Token exchange + Firebase sign-in + navigation run in the `googleResponse` useEffect
        // to avoid double sign-in and a race that briefly hits an unmatched route (404).
        keepLoadingForNativeCallback = true;
      } else if (result.type === 'error') {
        const msg =
          (result as any).params?.error_description ||
          (result as any).error?.message ||
          'Google sign-in failed.';
        Alert.alert('Error', String(msg));
      }
    } catch (error: any) {
      const msg = error?.message || '';
      if (!msg.toLowerCase().includes('cancel')) {
        console.error('Google Sign-In Error:', error?.code, error?.message);
        Alert.alert('Error', msg || 'Google sign-in failed. Please try again.');
      }
    } finally {
      // On success, keep spinner visible until googleResponse effect navigates.
      if (!keepLoadingForNativeCallback) {
        setIsLoading(false);
      }
    }
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios' || isLoading) return;
    setIsLoading(true);
    try {
      await signInWithApple({
        referralCode: referral.trim() || undefined,
      });
        scheduleAuthNavigation((href) => router.replace(href as any), '/(tabs)/home');
    } catch (error: any) {
      console.error('Apple Sign-In Error:', error?.code, error?.message);
      if (error?.message === 'SIGN_IN_CANCELLED') {
        return;
      }
      if (error?.code === 'auth/operation-not-allowed' || String(error?.message || '').toLowerCase().includes('not enabled')) {
        setAppleSignInUnavailableReason('Apple Sign-In currently unavailable');
      }
      const msg = error?.message || 'Apple sign-in failed.';
      Alert.alert('Error', msg);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, visible: false })}
          duration={toast.type === 'success' ? 2500 : 4000}
        />
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
            <TouchableOpacity
              onPress={() => {
                const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
                if (canGoBack) router.back();
                else router.replace('/splash');
              }}
              style={{ padding: 8 }}
            >
              <ChevronLeft size={22} color={Colors.text} />
            </TouchableOpacity>
            <Image 
              source={require('../assets/images/main logo.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>XPASS</Text>
            <View style={styles.spacer} />
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'login' 
                ? 'Login to access your gym pass' 
                : 'Sign up to get started with XPASS'}
            </Text>

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, errors.name && styles.inputWrapperError]}>
                  <User size={20} color={errors.name ? Colors.error : Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.textMuted}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) {
                        setErrors({ ...errors, name: undefined });
                      }
                    }}
                    autoCapitalize="words"
                  />
                </View>
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>
            )}

            <View style={styles.inputContainer}>
              <View style={[styles.inputWrapper, errors.email && styles.inputWrapperError]}>
                <Mail size={20} color={errors.email ? Colors.error : Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) {
                      setErrors({ ...errors, email: undefined });
                    }
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, errors.age && styles.inputWrapperError]}>
                  <User size={20} color={errors.age ? Colors.error : Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Age"
                    placeholderTextColor={Colors.textMuted}
                    value={age}
                    onChangeText={(text) => {
                      setAge(text);
                      if (errors.age) {
                        setErrors({ ...errors, age: undefined });
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>
                {errors.age && <Text style={styles.errorText}>{errors.age}</Text>}
              </View>
            )}

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <GiftIcon size={20} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Referral code (optional)"
                    placeholderTextColor={Colors.textMuted}
                    value={referral}
                    onChangeText={(t) => setReferral((t || '').toUpperCase())}
                    autoCapitalize="characters"
                  />
                </View>
                <Text style={styles.helperText}>Only the person who referred you gets 10 JDs credit.</Text>
              </View>
            )}

            {mode === 'login' && (
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity 
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={Colors.textMuted} />
                    ) : (
                      <Eye size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <View style={[styles.inputWrapper, errors.password && styles.inputWrapperError]}>
                  <Lock size={20} color={errors.password ? Colors.error : Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errors.password) {
                        setErrors({ ...errors, password: undefined });
                      }
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity 
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={Colors.textMuted} />
                    ) : (
                      <Eye size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              </View>
            )}

            {mode === 'login' && (
              <TouchableOpacity
                style={styles.stayLoggedInRow}
                onPress={async () => {
                  try {
                    await setStayLoggedInEnabled(!stayLoggedInEnabled);
                  } catch (e) {
                    console.warn('[Login] Failed to update stayLoggedIn setting:', e);
                  }
                }}
                disabled={isLoading}
              >
                {stayLoggedInEnabled ? (
                  <CheckSquare size={18} color={Colors.primary} />
                ) : (
                  <Square size={18} color={Colors.textMuted} />
                )}
                <Text style={styles.stayLoggedInText}>Stay Logged In (Face ID / Touch ID)</Text>
              </TouchableOpacity>
            )}

            {mode === 'login' && (
              <>
                <TouchableOpacity 
                  style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
                  onPress={handleLogin}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <>
                      <Lock size={18} color={Colors.white} />
                      <Text style={styles.continueButtonText}>Login</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => router.push('/forgot-password')}
                  disabled={isLoading}
                >
                  <Text style={styles.forgotPasswordButtonText}>Forgot Password</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'signup' && (
              <TouchableOpacity 
                style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
                onPress={handleSignUp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Lock size={18} color={Colors.white} />
                    <Text style={styles.continueButtonText}>Sign Up</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {Platform.OS === 'ios' && appleAuthAvailable && !appleSignInUnavailableReason && (
              <View
                style={[styles.appleButtonWrap, isLoading && styles.appleButtonWrapDisabled]}
                pointerEvents={isLoading ? 'none' : 'auto'}
              >
                <AppleAuthenticationButton
                  buttonType={
                    mode === 'signup'
                      ? AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={() => {
                    void handleAppleLogin();
                  }}
                />
              </View>
            )}
            {Platform.OS === 'ios' && (!!appleSignInUnavailableReason || !appleAuthAvailable) && (
              <View style={[styles.googleButton, styles.googleButtonUnavailable]}>
                <Text style={styles.googleButtonTextMuted}>
                  {appleSignInUnavailableReason || 'Apple Sign-In currently unavailable'}
                </Text>
              </View>
            )}

            {isGoogleButtonAvailable ? (
              <TouchableOpacity 
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                disabled={isLoading}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.googleButton, styles.googleButtonUnavailable]}>
                <Text style={styles.googleButtonTextMuted}>Google Sign-In currently unavailable</Text>
              </View>
            )}

            <View style={styles.toggleContainer}>
              <TouchableOpacity onPress={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setErrors({});
                setToast({ visible: false, message: '', type: 'info' });
              }}>
                <Text style={styles.toggleText}>
                  {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <Text style={styles.toggleTextBold}>
                    {mode === 'login' ? 'Sign Up' : 'Login'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.termsText}>
              By continuing you agree to Terms & Privacy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  logo: {
    width: 40,
    height: 40,
  },
  brandText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginLeft: 8,
  },
  spacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputWrapperError: {
    borderColor: Colors.error,
    borderWidth: 1.5,
  },
  errorText: {
    marginTop: 6,
    marginLeft: 2,
    fontSize: 12,
    color: Colors.error,
    fontWeight: '500' as const,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingLeft: 46,
    fontSize: 16,
    color: Colors.text,
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  stayLoggedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stayLoggedInText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  continueButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
    marginTop: 8,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600' as const,
  },
  appleButtonWrap: {
    marginBottom: 16,
  },
  appleButtonWrapDisabled: {
    opacity: 0.55,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  googleButton: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  googleButtonUnavailable: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  googleButtonTextMuted: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  toggleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  toggleText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  toggleTextBold: {
    fontWeight: '700' as const,
    color: '#DC143C',
  },
  termsText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  forgotPasswordButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: -8,
    borderWidth: 1,
    borderColor: '#DC143C',
  },
  forgotPasswordButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#DC143C',
  },
});
