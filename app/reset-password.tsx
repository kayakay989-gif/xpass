import { StyleSheet, Text, View, TouchableOpacity, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { ChevronLeft, Eye, EyeOff, Lock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { confirmPasswordReset } = useAuth();
  const params = useLocalSearchParams<{ oobCode?: string; mode?: string }>();
  const insets = useSafeAreaInsets();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);

  useEffect(() => {
    // Extract oobCode from URL parameters
    const code = typeof params.oobCode === 'string' ? params.oobCode : null;
    const mode = typeof params.mode === 'string' ? params.mode : null;
    
    if (code && mode === 'resetPassword') {
      setOobCode(code);
    } else if (code) {
      // Sometimes Firebase sends just the code without mode
      setOobCode(code);
    } else {
      // Try to extract from URL if not in params (for web)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCode = urlParams.get('oobCode');
        const urlMode = urlParams.get('mode');
        if (urlCode && (urlMode === 'resetPassword' || !urlMode)) {
          setOobCode(urlCode);
        }
      }
    }
  }, [params]);

  const handleResetPassword = async () => {
    if (!oobCode) {
      const msg = 'Invalid reset link. Please request a new password reset email.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      router.replace('/login');
      return;
    }

    if (!newPassword || !confirmPassword) {
      const msg = 'Please enter and confirm your new password.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    if (newPassword.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'Passwords do not match. Please try again.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordReset(oobCode, newPassword);
      
      const msg = 'Password reset successfully! You can now login with your new password.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Success', msg);
      }
      
      // Navigate to login screen
      router.replace('/login');
    } catch (error: any) {
      console.error('Reset password error:', error);
      const errorMessage = error?.message || 'Failed to reset password. Please try again.';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!oobCode) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <KeyboardAvoidingView 
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
            <TouchableOpacity
              onPress={() => router.replace('/login')}
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
            <Text style={styles.title}>Invalid Reset Link</Text>
            <Text style={styles.subtitle}>
              This password reset link is invalid or has expired. Please request a new password reset email.
            </Text>
            <TouchableOpacity 
              style={styles.continueButton}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.continueButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
            <TouchableOpacity
              onPress={() => router.replace('/login')}
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
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your new password below
            </Text>

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="New Password"
                  placeholderTextColor={Colors.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
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

            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm New Password"
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={Colors.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Lock size={18} color={Colors.white} />
                  <Text style={styles.continueButtonText}>Reset Password</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.backToLoginButton}
              onPress={() => router.replace('/login')}
              disabled={isLoading}
            >
              <Text style={styles.backToLoginText}>Back to Login</Text>
            </TouchableOpacity>
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
    width: 48,
    height: 48,
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
  backToLoginButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  backToLoginText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
});
