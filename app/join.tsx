import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Colors from '@/constants/colors';

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const initialRef = useMemo(() => {
    const r = typeof params.ref === 'string' ? params.ref.trim().toUpperCase() : '';
    return r;
  }, [params.ref]);

  const [referral, setReferral] = useState(initialRef);

  const goToSignup = () => {
    router.push({
      pathname: '/login',
      params: { mode: 'signup', ref: referral.trim().toUpperCase() },
    } as any);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Join XPASS' }} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Image
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Join XPASS</Text>
          <Text style={styles.subtitle}>
            Create an account to activate your referral. The person who referred you will earn <Text style={styles.bold}>10 JDS</Text> credit.
          </Text>

          <Text style={styles.label}>Referral code</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter referral code"
            placeholderTextColor={Colors.textMuted}
            value={referral}
            onChangeText={(t) => setReferral((t || '').toUpperCase())}
            autoCapitalize="characters"
          />

          <TouchableOpacity style={styles.primaryButton} onPress={goToSignup}>
            <Text style={styles.primaryButtonText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/login' as any)}
          >
            <Text style={styles.secondaryButtonText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  logo: {
    width: 44,
    height: 44,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  bold: {
    fontWeight: '800' as const,
    color: Colors.text,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  primaryButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '800' as const,
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '700' as const,
    fontSize: 13,
  },
});

