import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, updateProfileData } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sendOTPMutation = trpc.auth.sendOTP.useMutation();
  const verifyOTPMutation = trpc.auth.verifyOTP.useMutation();

  const initialPhoneRef = useRef<string>(user?.phone || '');

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');

    const rawPhone = user?.phone || '';
    if (rawPhone.startsWith('+962')) {
      setPhone(rawPhone.replace('+962', ''));
      initialPhoneRef.current = rawPhone;
    } else {
      setPhone(rawPhone);
      initialPhoneRef.current = rawPhone;
    }
  }, [user]);

  const hasPhoneChanged = useMemo(() => {
    const normalized = phone ? `+962${phone.replace(/\D/g, '')}` : '';
    return normalized !== initialPhoneRef.current;
  }, [phone]);

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
        email: email || undefined,
      });
      setOtpSent(true);
      Alert.alert('OTP sent', 'We sent a 6-digit code to your phone.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send OTP.');
    }
  };

  const handleSave = async () => {
    const fullPhone = normalizePhone();

    if (!name.trim()) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }

    // Only require OTP if phone number is being changed
    if (hasPhoneChanged) {
      if (!otpSent) {
        Alert.alert('OTP required', 'Send and verify OTP to update your phone.');
        return;
      }
      if (!otp.trim()) {
        Alert.alert('Enter OTP', 'Please enter the 6-digit code.');
        return;
      }
    }

    setIsSaving(true);
    try {
      // Verify OTP only if phone changed
      if (hasPhoneChanged) {
        await verifyOTPMutation.mutateAsync({
          phoneNumber: fullPhone,
          otp,
          name,
          email,
        });
      }

      // Update profile data (name, email, and phone if changed)
      await updateProfileData({
        name,
        email,
        phone: fullPhone || user?.phone,
      });

      Alert.alert('Saved', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Profile details</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

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

          {hasPhoneChanged && (
            <View style={styles.otpSection}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleSendOtp}
                disabled={sendOTPMutation.isPending}
              >
                {sendOTPMutation.isPending ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {otpSent ? 'Resend OTP' : 'Send OTP'}
                  </Text>
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
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
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
    marginBottom: 16,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
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
  otpSection: {
    gap: 8,
    marginTop: 8,
  },
  secondaryButton: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.white,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});

