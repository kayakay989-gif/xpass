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
import { Lock, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { trpc } from '@/lib/trpc';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GymLoginScreen() {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const loginMutation = trpc.gymOwners.login.useMutation();

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    setError('');
    try {
      const result = await loginMutation.mutateAsync({
        username: username.trim(),
        password,
      });

      if (result?.sessionToken) {
        await AsyncStorage.setItem('gymOwnerSessionToken', result.sessionToken);
        await AsyncStorage.setItem('gymOwnerGymId', result.gymId);
      }
      router.replace(`/gym-dashboard?gymId=${result.gymId}`);
    } catch (err: any) {
      // Handle different types of errors
      let message = 'Login failed. Please try again.';
      
      if (err?.message) {
        message = err.message;
      } else if (err?.data?.message) {
        message = err.data.message;
      } else if (typeof err === 'string') {
        message = err;
      }
      
      // Check for network errors
      if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
        message = 'Network error: Could not connect to the server. Please ensure the backend server is running on port 3000 and try again.';
      }
      
      setError(message);
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
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>XPASS</Text>
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.langPill} activeOpacity={0.8}>
            <Text style={styles.langText}>EN</Text>
          </TouchableOpacity>
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
              style={[styles.loginButton, loginMutation.isPending && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginText}>Login</Text>
              )}
            </TouchableOpacity>

            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                Contact your administrator for your assigned username and password.
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
  langPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  langText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800' as const,
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
