import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app, db, auth } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { PhoneAuthProvider, RecaptchaVerifier, updatePhoneNumber } from 'firebase/auth';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, firebaseUser, updateProfileData, logout } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const recaptchaContainerId = useMemo(() => 'recaptcha-container-profile-edit', []);
  const recaptchaVerifier = useRef<any>(null);

  const initialPhoneRef = useRef<string>(user?.phone || '');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
    setPhotoUrl(user?.photoUrl || '');

    const rawPhone = user?.phone || '';
    if (rawPhone.startsWith('+962')) {
      setPhone(rawPhone.replace('+962', ''));
      initialPhoneRef.current = rawPhone;
    } else {
      setPhone(rawPhone);
      initialPhoneRef.current = rawPhone;
    }
  }, [user]);

  const pickWebImageFile = async (): Promise<File | null> => {
    if (typeof document === 'undefined') return null;

    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    const input = fileInputRef.current;
    return await new Promise((resolve) => {
      const onChange = () => {
        input.removeEventListener('change', onChange);
        const file = input.files && input.files[0] ? input.files[0] : null;
        // allow selecting the same file again next time
        input.value = '';
        resolve(file);
      };
      input.addEventListener('change', onChange);
      input.click();
    });
  };

  const handleUploadPhoto = async () => {
    if (!firebaseUser) {
      showAlert('Not logged in', 'Please log in again to upload a photo.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const storage = getStorage(app);
      const objectRef = ref(storage, `userUploads/${firebaseUser.uid}/profile.jpg`);

      // Web: use native file input (more reliable than expo-image-picker on web exports)
      if (Platform.OS === 'web') {
        const file = await pickWebImageFile();
        if (!file) return;
        await uploadBytes(objectRef, file, { contentType: file.type || 'image/jpeg' });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          showAlert('Permission required', 'Please allow photo library access to upload a profile photo.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: true,
          aspect: [1, 1],
        });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        const uri = result.assets[0].uri;
        const resp = await fetch(uri);
        const blob = await resp.blob();
        await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
      }

      const downloadUrl = await getDownloadURL(objectRef);

      setPhotoUrl(downloadUrl);
      await updateProfileData({ photoUrl: downloadUrl });
      showAlert('Uploaded', 'Profile photo updated.');
    } catch (e: any) {
      console.error('[ProfileEdit] Upload photo failed:', e);
      showAlert('Upload failed', e?.message || 'Could not upload photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!firebaseUser) {
      setPhotoUrl('');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const storage = getStorage(app);
      const objectRef = ref(storage, `userUploads/${firebaseUser.uid}/profile.jpg`);

      // Best-effort delete (ignore if missing / denied)
      await deleteObject(objectRef).catch(() => null);

      setPhotoUrl('');
      await updateProfileData({ photoUrl: '' });
      showAlert('Removed', 'Profile photo removed.');
    } catch (e: any) {
      console.error('[ProfileEdit] Remove photo failed:', e);
      showAlert('Error', e?.message || 'Could not remove photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const hasPhoneChanged = useMemo(() => {
    const normalized = phone ? `+962${phone.replace(/\D/g, '')}` : '';
    return normalized !== initialPhoneRef.current;
  }, [phone]);

  useEffect(() => {
    // If phone changes, force re-send OTP
    setOtpSent(false);
    setVerificationId(null);
    setOtp('');
  }, [hasPhoneChanged]);

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
      showAlert('Invalid phone', 'Please enter a valid phone number.');
      return;
    }
    if (!firebaseUser || !auth.currentUser) {
      showAlert('Not logged in', 'Please log in to verify your phone.');
      return;
    }
    try {
      const provider = new PhoneAuthProvider(auth);
      if (Platform.OS === 'web') {
        const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible' });
        await verifier.render();
        const id = await provider.verifyPhoneNumber(fullPhone, verifier);
        setVerificationId(id);
      } else {
        if (!recaptchaVerifier.current) {
          throw new Error('reCAPTCHA verifier is not ready. Please try again.');
        }
        const id = await provider.verifyPhoneNumber(fullPhone, recaptchaVerifier.current);
        setVerificationId(id);
      }

      setOtpSent(true);
      showAlert('OTP sent', 'We sent a 6-digit code to your phone.');
    } catch (error: any) {
      console.error('[ProfileEdit] Failed to send OTP:', error);
      showAlert('Error', error.message || 'Failed to send OTP.');
    }
  };

  const handleSave = async () => {
    const fullPhone = normalizePhone();

    if (!name.trim()) {
      showAlert('Missing name', 'Please enter your full name.');
      return;
    }

    // Only require OTP if phone number is being changed
    if (hasPhoneChanged) {
      if (!otpSent) {
        showAlert('OTP required', 'Send and verify OTP to update your phone.');
        return;
      }
      if (!otp.trim()) {
        showAlert('Enter OTP', 'Please enter the 6-digit code.');
        return;
      }
    }

    setIsSaving(true);
    try {
      // Verify OTP only if phone changed
      if (hasPhoneChanged) {
        if (!verificationId) {
          throw new Error('Please send OTP first.');
        }
        if (!firebaseUser || !auth.currentUser) {
          throw new Error('Please log in to verify your phone.');
        }
        console.log('[ProfileEdit] Verifying OTP with verificationId:', verificationId.substring(0, 10) + '...');
        const credential = PhoneAuthProvider.credential(verificationId, otp.trim());
        console.log('[ProfileEdit] Credential created, updating phone number...');
        await updatePhoneNumber(auth.currentUser, credential);
        console.log('[ProfileEdit] Phone number updated successfully');
      }

      // Update profile data (name, email, and phone if changed)
      await updateProfileData({
        name,
        email,
        phone: fullPhone || user?.phone,
        photoUrl: photoUrl.trim(),
      });

      showAlert('Saved', 'Profile updated successfully.');
      router.replace('/profile');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!firebaseUser) {
      showAlert('Not logged in', 'Please log in again to delete your account.');
      return;
    }

    Alert.alert(
      'Delete account',
      'This will permanently delete your account. This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              // Firebase will require recent authentication for some providers.
              await firebaseUser.delete();

              // Best-effort cleanup for related user data.
              await deleteDoc(doc(db, 'users', firebaseUser.uid)).catch(() => null);

              const storage = getStorage(app);
              const photoRef = ref(storage, `userUploads/${firebaseUser.uid}/profile.jpg`);
              await deleteObject(photoRef).catch(() => null);

              try {
                await logout();
              } catch {
                // Account deletion already signs the user out server-side; ignore logout errors.
              }

              router.replace('/splash');
            } catch (e: any) {
              console.error('[ProfileEdit] Delete account failed:', e);
              showAlert(
                'Delete failed',
                e?.message ||
                  'Could not delete your account. Please try again after re-authenticating (log out and log back in).'
              );
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
      <View style={styles.container}>
        {Platform.OS !== 'web' && (
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifier}
            firebaseConfig={app.options}
          />
        )}
        <Text style={styles.title}>Profile details</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Profile photo (optional)</Text>
          <View style={styles.photoRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={{ color: Colors.textMuted, fontWeight: '700' }}>No photo</Text>
              </View>
            )}
            <View style={styles.photoButtons}>
              <TouchableOpacity
                style={[styles.secondaryButton, (isUploadingPhoto || isSaving) && styles.saveButtonDisabled]}
                onPress={handleUploadPhoto}
                disabled={isUploadingPhoto || isSaving}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Upload</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryOutlineButton, (isUploadingPhoto || isSaving) && styles.saveButtonDisabled]}
                onPress={handleRemovePhoto}
                disabled={isUploadingPhoto || isSaving}
              >
                <Text style={styles.secondaryOutlineButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>

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
                disabled={isSaving}
              >
                <Text style={styles.secondaryButtonText}>
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </Text>
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

          {Platform.OS === 'web' &&
            // RN Web: render an offscreen div for the invisible reCAPTCHA
            // @ts-ignore
            React.createElement('div', {
              id: recaptchaContainerId,
              style: { position: 'absolute', left: '-10000px', top: '-10000px' },
            })}

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

          <TouchableOpacity
            style={[
              styles.deleteAccountButton,
              (isDeletingAccount || isSaving || isUploadingPhoto) && styles.saveButtonDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount || isSaving || isUploadingPhoto}
          >
            {isDeletingAccount ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.deleteAccountButtonText}>Delete my account</Text>
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
  photoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: {
    flex: 1,
    gap: 10,
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
  secondaryOutlineButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: Colors.text,
    fontWeight: '600',
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
  deleteAccountButton: {
    backgroundColor: '#ffffff',
    borderColor: '#DC143C',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteAccountButtonText: {
    color: '#DC143C',
    fontWeight: '800',
    fontSize: 16,
  },
});

