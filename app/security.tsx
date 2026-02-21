import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { PhoneAuthProvider, RecaptchaVerifier, updatePhoneNumber } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { config } from '@/lib/config';

export default function SecurityScreen() {
  const { user, firebaseUser, updateProfileData } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);

  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);
  const recaptchaContainerId = useMemo(() => 'recaptcha-container-security', []);

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

  useEffect(() => {
    // If phone changes, force re-send OTP
    setOtpSent(false);
    setVerificationId(null);
    setOtp('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleSendOtp = async () => {
    const fullPhone = normalizePhone();
    if (!fullPhone || fullPhone.length < 10) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    if (!firebaseUser || !auth.currentUser) {
      showAlert('Not logged in', 'Please log in to verify your phone.');
      return;
    }
    setIsSendingOtp(true);
    try {
      const provider = new PhoneAuthProvider(auth);
      if (Platform.OS === 'web') {
        const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
        await verifier.render();
        const id = await provider.verifyPhoneNumber(fullPhone, verifier);
        setVerificationId(id);
      } else {
        const id = await provider.verifyPhoneNumber(fullPhone, recaptchaVerifier.current as any);
        setVerificationId(id);
      }

      setOtpSent(true);
      showAlert('OTP sent', 'Enter the code we sent to your phone.');
    } catch (error: any) {
      console.error('[Security] Failed to send OTP:', error);
      showAlert(
        'Error',
        error?.message ||
          'Failed to send OTP. Ensure Firebase Phone Auth is enabled and your domain is authorized.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerify = async () => {
    const fullPhone = normalizePhone();
    if (!otp.trim()) {
      Alert.alert('Missing OTP', 'Enter the 6-digit code.');
      return;
    }
    if (!verificationId) {
      showAlert('OTP required', 'Please send an OTP first.');
      return;
    }
    if (!firebaseUser || !auth.currentUser) {
      showAlert('Not logged in', 'Please log in to verify your phone.');
      return;
    }
    setIsVerifying(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp);
      await updatePhoneNumber(auth.currentUser, credential);
      await updateProfileData({ phone: fullPhone });
      Alert.alert('Phone verified', 'Your phone number was updated.');
    } catch (error: any) {
      console.error('[Security] OTP verify failed:', error);
      showAlert('Error', error?.message || 'Verification failed.');
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
          disabled={isSendingOtp}
        >
          {isSendingOtp ? (
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

        {Platform.OS !== 'web' && (
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifier}
            firebaseConfig={config.firebase as any}
            attemptInvisibleVerification
          />
        )}

        {Platform.OS === 'web' &&
          // RN Web: render an offscreen div for the invisible reCAPTCHA
          // @ts-ignore
          React.createElement('div', {
            id: recaptchaContainerId,
            style: { position: 'absolute', left: '-10000px', top: '-10000px' },
          })}
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

