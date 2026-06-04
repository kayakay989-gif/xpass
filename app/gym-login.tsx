import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ChevronLeft, Lock, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc } from '@/lib/trpc';
import { config } from '@/lib/config';
import {
  normalizeGymOwnerUsername,
  sanitizeGymOwnerPassword,
  stripInvisibleUsernameChars,
} from '@/lib/gym-owner-username';
import { getGymLoginUserMessage } from '@/lib/gym-login-errors';

export default function GymLoginScreen() {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const loginMutation = trpc.gymOwners.login.useMutation();

  const handleLogin = async () => {
    const trimmedUsername = stripInvisibleUsernameChars(username).trim();
    const trimmedPassword = sanitizeGymOwnerPassword(password);
    const normalizedUsername = normalizeGymOwnerUsername(trimmedUsername);

    if (!normalizedUsername || !trimmedPassword) {
      setError('Please enter both username and password');
      return;
    }

    setError('');
    setIsLoading(true);

    console.log('[GymLogin] Submitting login', {
      submittedUsernameLength: username.length,
      normalizedUsername,
      apiBaseUrl: config.api.baseUrl || '(default fallback)',
    });

    const attemptLogin = () =>
      loginMutation.mutateAsync({
        username: normalizedUsername,
        password: trimmedPassword,
      });

    try {
      let result;
      try {
        result = await attemptLogin();
      } catch (firstErr: any) {
        const retryable =
          String(firstErr?.name || '').includes('Abort') ||
          String(firstErr?.message || '').toLowerCase().includes('abort');
        if (!retryable) throw firstErr;
        console.warn('[GymLogin] Login timed out, retrying once...');
        await new Promise((r) => setTimeout(r, 800));
        result = await attemptLogin();
      }

      console.log('[GymLogin] Login success', {
        gymId: result.gymId,
        ownerId: result.owner.id,
      });

      await AsyncStorage.setItem('gymOwnerSessionToken', result.sessionToken);
      await AsyncStorage.setItem('gymOwnerGymId', result.gymId);
      await AsyncStorage.setItem('gymOwnerId', result.owner.id);

      router.replace(`/gym-dashboard?gymId=${result.gymId}`);
    } catch (err: any) {
      console.error('[GymLogin] Login error:', {
        message: err?.message,
        status: err?.status,
        normalizedUsername,
      });
      setError(getGymLoginUserMessage(err));
      setIsLoading(false);
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
            <Text style={styles.cardTitle}>Gym Owner Login</Text>
            <Text style={styles.cardSubtitle}>Login to manage your gym</Text>

            <View style={styles.inputContainer}>
              <User size={20} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
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
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.loginButton, isLoading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </TouchableOpacity>

            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                Contact your administrator for your assigned username and password. You can type or
                paste the password — both work the same when it matches admin exactly.
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
    width: 40,
    height: 40,
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
  infoContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'left' as const,
    fontWeight: '600' as const,
  },
});
