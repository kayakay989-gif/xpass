import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { GooglePayButton } from '@/components/GooglePayButton';
import type { WalletMethod } from '@/lib/wallet-pay';

type Props = {
  method: WalletMethod;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

const BUTTON_HEIGHT = 48;

/**
 * Wallet checkout button.
 * Android Google Pay uses the official PayButton API (Google brand requirement).
 * iOS uses the standard Apple Pay styled button.
 */
export function WalletPayButton({
  method,
  onPress,
  disabled = false,
  loading = false,
  style,
  testID = 'wallet-pay-button',
}: Props) {
  if (method === 'google_pay' && Platform.OS === 'android') {
    return (
      <GooglePayButton
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        style={style}
        testID={testID}
      />
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.appleButton,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Pay with Apple Pay"
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.appleLabel}>
          {Platform.OS === 'ios' ? '\uF8FF' : ''} Pay
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  appleLabel: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.55,
  },
});
