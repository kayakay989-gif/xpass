import { StyleSheet, Text, View, TouchableOpacity, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, Eye, EyeOff, Gift as GiftIcon, Lock, Mail, Phone, User } from 'lucide-react-native';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@/constants/googleOAuth';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import Toast from '@/components/Toast';

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, signUpWithEmail, loginWithGoogle, signInWithGoogleIdToken, logout, isAdmin } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; ref?: string }>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('login');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Validation error states
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
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

  // Standalone Android: expo-auth-session's Google provider defaults to
  // `applicationId:/oauthredirect` (e.g. com.xpass.unique:/oauthredirect). That scheme is NOT
  // declared in AndroidManifest (only `xpass` is), and Google returns 400 invalid_request unless
  // the Android OAuth client allows that custom redirect. Use the app scheme from app.json instead.
  const nativeGoogleRedirectUri =
    Platform.OS !== 'web' ? AuthSession.makeRedirectUri({ scheme: 'xpass', path: 'oauthredirect' }) : undefined;

  const [googleAuthRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest(
    {
      androidClientId: GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
      ...(nativeGoogleRedirectUri ? { redirectUri: nativeGoogleRedirectUri } : {}),
    },
    { scheme: 'xpass' }
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (googleResponse?.type !== 'success') return;
    const idToken =
      (googleResponse.params?.id_token as string | undefined) ||
      (googleResponse.params as any)?.id_token;
    if (!idToken || googleIdTokenHandledRef.current === idToken) return;
    googleIdTokenHandledRef.current = idToken;
    (async () => {
      try {
        setIsLoading(true);
        await signInWithGoogleIdToken(idToken);
        router.replace('/(tabs)/home');
      } catch (e: any) {
        googleIdTokenHandledRef.current = null;
        Alert.alert('Error', e?.message || 'Google sign-in failed.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [googleResponse, signInWithGoogleIdToken, router]);

  useEffect(() => {
    if (__DEV__ && nativeGoogleRedirectUri) {
      console.log(
        '[Google OAuth] Native redirectUri — use this exact value in Google Cloud → Android OAuth client (custom URI / redirect allowlist):',
        nativeGoogleRedirectUri
      );
    }
  }, [nativeGoogleRedirectUri]);

  useEffect(() => {
    const m = typeof params.mode === 'string' ? params.mode.trim().toLowerCase() : '';
    const r = typeof params.ref === 'string' ? params.ref.trim().toUpperCase() : '';
    if (m === 'signup') setMode('signup');
    if (r) setReferral(r);
  }, [params.mode, params.ref]);

  const validatePhone = (phoneNum: string): boolean => {
    const jordanPhoneRegex = /^[0-9]{9}$/;
    return jordanPhoneRegex.test(phoneNum);
  };

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

    // Validate phone - normalize by removing all non-digit characters
    const phoneDigitsOnly = phone.replace(/\D/g, '');
    if (!phoneDigitsOnly) {
      newErrors.phone = 'Phone number is required';
    } else if (phoneDigitsOnly.length !== 9) {
      newErrors.phone = 'Please enter a valid 9-digit Jordan phone number (without +962)';
    }

    // Validate age
    if (!age.trim()) {
      newErrors.age = 'Age is required';
    } else {
      const ageNum = parseInt(age, 10);
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
        newErrors.age = 'Please enter a valid age (1-150)';
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
    const trimmedPhone = phone.trim();
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

    // Normalize phone: remove all non-digit characters, then check length
    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length !== 9) {
      setErrors({ phone: 'Phone number is required' });
      setToast({
        visible: true,
        message: 'Please enter a valid 9-digit phone number (without +962)',
        type: 'error',
      });
      return;
    }

    if (!trimmedAge || isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
      setErrors({ age: 'Age is required' });
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
        `+962${phoneDigits}`, 
        referral.trim() || undefined, 
        ageNum
      );

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
      setPhone('');
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
      
      if (lowerMessage.includes('email') && !lowerMessage.includes('phone')) {
        newErrors.email = errorMessage;
      } else if (lowerMessage.includes('password')) {
        newErrors.password = errorMessage;
      } else if (lowerMessage.includes('phone')) {
        newErrors.phone = errorMessage;
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
    try {
      await loginWithEmail(email.trim(), password);
      console.log('[Login] Email/password login successful, navigating to home');
      // Route based on role: admins go to admin dashboard, users to main app
      if (isAdmin) {
        router.replace('/admin-dashboard');
      } else {
        router.replace('/(tabs)/home');
      }
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
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (Platform.OS === 'web') {
      setIsLoading(true);
      try {
        await loginWithGoogle();
        router.replace('/(tabs)/home');
      } catch (error: any) {
        console.error('Google login error:', error);
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
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const result = await googlePromptAsync({ showInRecents: true });
      if (result.type === 'success') {
        const idToken =
          (result.params?.id_token as string | undefined) || (result.params as any)?.id_token;
        if (idToken && googleIdTokenHandledRef.current !== idToken) {
          googleIdTokenHandledRef.current = idToken;
          await signInWithGoogleIdToken(idToken);
          router.replace('/(tabs)/home');
        }
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
        console.error('Google login error:', error);
        Alert.alert('Error', msg || 'Google sign-in failed. Please try again.');
      }
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
                <View style={[styles.inputWrapper, errors.phone && styles.inputWrapperError]}>
                  <Phone size={20} color={errors.phone ? Colors.error : Colors.textMuted} style={styles.inputIcon} />
                  <View style={styles.countryCodeContainer}>
                    <Text style={styles.countryCode}>+962</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Phone (9 digits)"
                    placeholderTextColor={Colors.textMuted}
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      if (errors.phone) {
                        setErrors({ ...errors, phone: undefined });
                      }
                    }}
                    keyboardType="phone-pad"
                    maxLength={9}
                  />
                </View>
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>
            )}

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

            <TouchableOpacity 
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading || (Platform.OS !== 'web' && !googleAuthRequest)}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

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
  countryCodeContainer: {
    position: 'absolute',
    left: 46,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 8,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingLeft: 90,
    fontSize: 16,
    color: Colors.text,
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 2,
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
