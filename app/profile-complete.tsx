import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import {
  isMemberProfileComplete,
  isValidMemberAge,
  isValidMemberEmail,
  isValidMemberName,
  MIN_MEMBER_AGE,
  resolveMemberDisplayName,
} from '@/lib/profile-validation';

export default function ProfileCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, firebaseUser, isGuest, isAdmin, refreshUserProfile, bootstrapNavigationReady } = useAuth();
  const completeProfile = trpc.users.completeProfile.useMutation();

  const initialName = useMemo(
    () => resolveMemberDisplayName(user?.name, firebaseUser?.displayName),
    [user?.name, firebaseUser?.displayName]
  );
  const initialEmail = useMemo(
    () => (user?.email || firebaseUser?.email || '').trim().toLowerCase(),
    [user?.email, firebaseUser?.email]
  );

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [age, setAge] = useState(user?.age != null ? String(user.age) : '');
  const [errors, setErrors] = useState<{ name?: string; email?: string; age?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
    setEmail(initialEmail);
  }, [initialName, initialEmail]);

  useEffect(() => {
    if (!bootstrapNavigationReady) return;
    if (isGuest || !firebaseUser) {
      router.replace('/login');
      return;
    }
    if (isAdmin) {
      router.replace('/admin-dashboard');
      return;
    }
    if (isMemberProfileComplete(user, firebaseUser?.email, firebaseUser?.displayName)) {
      router.replace('/(tabs)/home');
    }
  }, [bootstrapNavigationReady, firebaseUser, isAdmin, isGuest, router, user]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!isValidMemberName(name)) {
      next.name = 'Full name is required';
    }
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!isValidMemberEmail(email)) {
      next.email = 'Please enter a valid email address';
    }
    const ageNum = parseInt(age.trim(), 10);
    if (!age.trim()) {
      next.age = 'Age is required';
    } else if (!isValidMemberAge(ageNum)) {
      next.age = `You must be at least ${MIN_MEMBER_AGE} years old`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validate() || !firebaseUser) return;

    const ageNum = parseInt(age.trim(), 10);
    try {
      await completeProfile.mutateAsync({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        age: ageNum,
      });
      await refreshUserProfile();
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setSubmitError(error?.message || 'Could not save your profile. Please try again.');
    }
  };

  if (!bootstrapNavigationReady || !firebaseUser || isGuest) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Before you continue, please confirm your name, age, and email. This information is required for your Xpass membership.
          </Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, errors.name && styles.inputError]}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            autoCapitalize="words"
            editable={!completeProfile.isPending}
          />
          {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={[styles.input, errors.age && styles.inputError]}
            value={age}
            onChangeText={setAge}
            placeholder={`Minimum age ${MIN_MEMBER_AGE}`}
            keyboardType="number-pad"
            editable={!completeProfile.isPending}
          />
          {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!completeProfile.isPending}
          />
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

          <TouchableOpacity
            style={[styles.button, completeProfile.isPending && styles.buttonDisabled]}
            onPress={() => void handleSubmit()}
            disabled={completeProfile.isPending}
          >
            {completeProfile.isPending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Continue to Xpass</Text>
            )}
          </TouchableOpacity>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 6,
    backgroundColor: Colors.white,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    marginBottom: 12,
  },
  submitError: {
    color: Colors.error,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
