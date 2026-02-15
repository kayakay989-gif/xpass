import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/contexts/AuthContext';

export default function SecurityScreen() {
  const { user, updateProfileData } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const sendOTPMutation = trpc.auth.sendOTP.useMutation();
  const verifyOTPMutation = trpc.auth.verifyOTP.useMutation();

  useEffect(() => {
    const rawPhone = user?.phone || '';
    if (rawPhone.startsWith('+962')) {
      setPhone(rawPhone.replace('+962', ''));
    } else {
      setPhone(rawPhone);
    }
  }, [user]);

  const normalizePhone = (): string => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('962')) return `+${digits}`;
    if (digits.startsWith('+')) return digits;
    return `+962${digits}`;
  };

  const handleSendOtp = async () => {
    const fullPhone = normalizePhone();
    if (!fullPhone || fullPhone.length < 10) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    try {
      await sendOTPMutation.mutateAsync({
        phoneNumber: fullPhone,
        method: 'sms',
        email: user?.email || undefined,
      });
      setOtpSent(true);
      Alert.alert('OTP sent', 'Enter the code we sent to your phone.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send OTP.');
    }
  };

  const handleVerify = async () => {
    const fullPhone = normalizePhone();
    if (!otp.trim()) {
      Alert.alert('Missing OTP', 'Enter the 6-digit code.');
      return;
    }
    setIsVerifying(true);
    try {
      await verifyOTPMutation.mutateAsync({
        phoneNumber: fullPhone,
        otp,
        name: user?.name,
        email: user?.email,
      });
      await updateProfileData({ phone: fullPhone });
      Alert.alert('Phone verified', 'Your phone number was updated.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Security' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Phone OTP</Text>
        <Text style={styles.subtitle}>Verify your phone to secure your account.</Text>

        <Text style={styles.label}>Phone number</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.countryCode}>+962</Text>
          <TextInput
            style={[styles.input, { flex: 1, paddingLeft: 58 }]}
            placeholder="9 digit phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={9}
          />
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSendOtp}
          disabled={sendOTPMutation.isPending}
        >
          {sendOTPMutation.isPending ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>{otpSent ? 'Resend OTP' : 'Send OTP'}</Text>
          )}
        </TouchableOpacity>

        {otpSent && (
          <>
            <Text style={styles.label}>Enter OTP</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />

            <TouchableOpacity
              style={[styles.secondaryButton, isVerifying && styles.secondaryButtonDisabled]}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.secondaryButtonText}>Verify & Save</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.white,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginTop: 6,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCode: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
    fontWeight: '700',
    color: Colors.text,
  },
  primaryButton: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
});

