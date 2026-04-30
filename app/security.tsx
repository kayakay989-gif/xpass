import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import Toast from '@/components/Toast';
import { CheckCircle } from 'lucide-react-native';

export default function SecurityScreen() {
  const { user, firebaseUser, updateProfileData } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSessionPhone, setOtpSessionPhone] = useState<string | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const sendOtpMutation = trpc.auth.sendOTP.useMutation();
  const verifyOtpMutation = trpc.auth.verifyOTP.useMutation();

  useEffect(() => {
    const rawPhone = user?.phone || '';
    if (rawPhone.startsWith('+962')) {
      setPhone(rawPhone.replace('+962', ''));
    } else {
      setPhone(rawPhone);
    }
  }, [user]);

  // Reset verification state if phone number changes
  useEffect(() => {
    if (user?.phoneVerified) {
      setOtpSent(false);
      setOtpSessionPhone(null);
      setOtp('');
    }
  }, [user?.phone, user?.phoneVerified]);

  const normalizePhone = (): string => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('962')) return `+${digits}`;
    return `+962${digits}`;
  };

  const isValidJordanE164 = (fullPhone: string): boolean => {
    return /^\+962\d{9}$/.test(fullPhone);
  };

  useEffect(() => {
    // If phone changes, force re-send OTP
    setOtpSent(false);
    setOtpSessionPhone(null);
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
    if (!isValidJordanE164(fullPhone)) {
      Alert.alert('Invalid phone', 'Please enter a valid Jordan phone number in this format: +962XXXXXXXXX');
      return;
    }
    if (!firebaseUser) {
      showAlert('Not logged in', 'Please log in to verify your phone.');
      return;
    }
    setIsSendingOtp(true);
    try {
      const response = await sendOtpMutation.mutateAsync({
        phoneNumber: fullPhone,
        method: 'sms',
      });
      if ((response as any)?.devOtp) {
        setOtp((response as any).devOtp);
      }
      setOtpSessionPhone(fullPhone);
      setOtpSent(true);
      showAlert('OTP sent', 'Enter the code we sent to your phone.');
    } catch (error: any) {
      console.error('[Security] Failed to send OTP:', error);
      showAlert(
        'Error',
        error?.message ||
          'Failed to send OTP. Please verify your number and try again.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerify = async () => {
    const fullPhone = normalizePhone();
    if (!isValidJordanE164(fullPhone)) {
      setToast({
        visible: true,
        message: 'Invalid phone number format. Use +962XXXXXXXXX.',
        type: 'error',
      });
      return;
    }
    if (!otp.trim()) {
      setToast({
        visible: true,
        message: 'Please enter the 6-digit code',
        type: 'error',
      });
      return;
    }
    if (!otpSessionPhone) {
      setToast({
        visible: true,
        message: 'Please send an OTP first',
        type: 'error',
      });
      return;
    }
    if (!firebaseUser) {
      setToast({
        visible: true,
        message: 'Please log in to verify your phone',
        type: 'error',
      });
      return;
    }
    setIsVerifying(true);
    try {
      await verifyOtpMutation.mutateAsync({
        phoneNumber: otpSessionPhone,
        otp: otp.trim(),
      });
      
      // Update phone and mark as verified
      await updateProfileData({ 
        phone: fullPhone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      });
      
      console.log('[Security] Phone verification successful');
      
      // Show success toast
      setToast({
        visible: true,
        message: 'Phone number verified successfully',
        type: 'success',
      });
      
      setOtp('');
      setOtpSent(false);
      setOtpSessionPhone(null);
    } catch (error: any) {
      console.error('[Security] OTP verify failed:', error);
      let errorMessage = 'Verification failed.';
      if (error?.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code';
      } else if (error?.code === 'auth/code-expired') {
        errorMessage = 'Verification code expired. Please request a new one.';
      } else if (error?.message) {
        errorMessage = error.message;
      }
      setToast({
        visible: true,
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const isPhoneVerified = user?.phoneVerified === true;
  const displayPhone = user?.phone || normalizePhone();

  return (
    <>
      <Stack.Screen options={{ title: 'Security' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Phone OTP</Text>
        <Text style={styles.subtitle}>Verify your phone to secure your account.</Text>

        {isPhoneVerified && (
          <View style={styles.verifiedBadge}>
            <CheckCircle size={20} color="#059669" />
            <Text style={styles.verifiedText}>Phone number verified</Text>
          </View>
        )}

        <Text style={styles.label}>Phone number</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.countryCode}>+962</Text>
          <TextInput
            style={[
              styles.input, 
              { flex: 1, paddingLeft: 58 },
              isPhoneVerified && styles.inputDisabled
            ]}
            placeholder="9 digit phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={9}
            editable={!isPhoneVerified}
          />
        </View>

        {!isPhoneVerified && (
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
        )}

        {otpSent && !isPhoneVerified && (
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

        {isPhoneVerified && (
          <View style={styles.verifiedInfo}>
            <Text style={styles.verifiedInfoText}>
              Your phone number {displayPhone} is verified and secure.
            </Text>
            <Text style={styles.verifiedInfoSubtext}>
              To change your phone number, please contact support.
            </Text>
          </View>
        )}

        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, visible: false })}
        />
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
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  verifiedText: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '600',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: Colors.textSecondary,
  },
  verifiedInfo: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  verifiedInfoText: {
    color: Colors.text,
    fontSize: 14,
    marginBottom: 4,
  },
  verifiedInfoSubtext: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
});

