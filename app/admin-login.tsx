import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ChevronLeft, Lock, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function AdminLoginScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { loginWithEmail, logout } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const normalizedEmail = email.trim();
      if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
        setError('Please enter a valid email address.');
        return;
      }
      await loginWithEmail(normalizedEmail, password);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        await logout();
        setError('Login failed. Please try again.');
        return;
      }

      const normalize = (v: any) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
      const uid = currentUser.uid;

      // Admin access (Option B) comes from Firestore:
      // - users/{uid}: { role: "admin", status: "active" }
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.exists() ? userSnap.data() : null;

      if (!userSnap.exists()) {
        await logout();
        setError('Admin account not found in system. Please contact administrator.');
        return;
      }

      const role = normalize(userData?.role);
      const status = normalize(userData?.status);

      console.log('[AdminLogin] User data:', { uid, role, status, email: userData?.email });

      if (role === 'admin' && status === 'active') {
        router.replace('/admin-dashboard' as any);
      } else {
        await logout();
        if (role !== 'admin') {
          setError(`Account does not have admin role. Current role: ${role || 'none'}. Please contact administrator.`);
        } else if (status !== 'active') {
          setError(`Admin account is not active. Current status: ${status || 'none'}. Please contact administrator.`);
        } else {
          setError('This account is not authorized as an admin.');
        }
      }
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        const message = err?.message || 'Login failed. Please try again.';
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <TouchableOpacity
            onPress={() => {
              const canGoBack = typeof (router as any).canGoBack === 'function' ? (router as any).canGoBack() : false;
              if (canGoBack) (router as any).back();
              else router.replace('/splash' as any);
            }}
            style={{ padding: 8, marginLeft: -8 }}
          >
            <ChevronLeft size={22} color="#111827" />
          </TouchableOpacity>
          <Image
            source={require('../assets/images/main logo.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>XPASS</Text>
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.profilePill} activeOpacity={0.8}>
            <User size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Admin Login</Text>
            <Text style={styles.cardSubtitle}>System Administrator Access</Text>

            <View style={styles.inputContainer}>
              <User size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Admin email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </TouchableOpacity>

            <View style={styles.demoCredentials}>
              <Text style={styles.demoTitle}>Need access?</Text>
              <Text style={styles.demoText}>
                Only Firebase users with the admin role can log in here.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  topBar: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  brandRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  brandLogo: {
    width: 28,
    height: 28,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#111827',
    letterSpacing: 0.4,
  },
  topBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  profilePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center' as const,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: '#111827',
    marginBottom: 4,
    textAlign: 'left' as const,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    paddingVertical: 14,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center' as const,
  },
  loginButton: {
    backgroundColor: '#E31E24',
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  loginText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800' as const,
  },
  demoCredentials: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: 'bold' as const,
    color: '#111827',
    marginBottom: 8,
  },
  demoText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
});
