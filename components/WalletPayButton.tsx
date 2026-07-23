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
import { GooglePayMark } from '@/components/GooglePayMark';
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
 * Brand-compliant wallet checkout button.
 * Google Pay: dark pill, "Pay with" + official G Pay mark (pay button type).
 * Apple Pay: black button with  Pay (iOS only).
 */
export function WalletPayButton({
  method,
  onPress,
  disabled = false,
  loading = false,
  style,
  testID = 'wallet-pay-button',
}: Props) {
  const isGoogle = method === 'google_pay';

  return (
    <TouchableOpacity
      style={[
        isGoogle ? styles.googleButton : styles.appleButton,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={isGoogle ? 'Pay with Google Pay' : 'Pay with Apple Pay'}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : isGoogle ? (
        <View style={styles.googleContent}>
          <Text style={styles.googlePrefix}>Pay with</Text>
          <GooglePayMark height={22} variant="dark" />
        </View>
      ) : (
        <Text style={styles.appleLabel}>
          {Platform.OS === 'ios' ? '\uF8FF' : ''} Pay
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  appleButton: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  googleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googlePrefix: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.1,
    includeFontPadding: false,
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
