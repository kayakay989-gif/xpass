import React from 'react';
import {
  ActivityIndicator,
  requireNativeComponent,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { getGooglePayAllowedPaymentMethodsJson } from '@/lib/google-pay-allowed-methods';

type NativeProps = {
  style?: ViewStyle;
  theme?: 'dark' | 'light';
  buttonType?: 'pay' | 'buy' | 'checkout' | 'order' | 'plain';
  cornerRadius?: number;
  allowedPaymentMethods?: string;
  enabled?: boolean;
  onPress?: (event: unknown) => void;
};

const NativeGooglePayButton =
  requireNativeComponent<NativeProps>('GooglePayButton');

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Official Google Pay PayButton — required for Google Pay API production approval. */
export function GooglePayButton({
  onPress,
  disabled = false,
  loading = false,
  style,
  testID = 'google-pay-button',
}: Props) {
  const isInteractive = !disabled && !loading;

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Pay with Google Pay"
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
    >
      <NativeGooglePayButton
        style={styles.button}
        theme="dark"
        buttonType="pay"
        cornerRadius={24}
        allowedPaymentMethods={getGooglePayAllowedPaymentMethodsJson()}
        enabled={isInteractive}
        onPress={isInteractive ? onPress : undefined}
      />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 152,
    minHeight: 48,
    marginVertical: 8,
  },
  button: {
    width: '100%',
    minWidth: 152,
    minHeight: 48,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 24,
  },
});
