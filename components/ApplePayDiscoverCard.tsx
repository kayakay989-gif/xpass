import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';
import { WalletPayButton } from '@/components/WalletPayButton';

type Props = {
  onPress: () => void;
};

/** Always-visible iOS entry so App Review can find Apple Pay without completing a new purchase first. */
export function ApplePayDiscoverCard({ onPress }: Props) {
  if (Platform.OS !== 'ios') return null;

  return (
    <View style={styles.card} testID="apple-pay-entry" accessibilityLabel="Apple Pay">
      <Text style={styles.title}>Apple Pay</Text>
      <Text style={styles.body}>
        Pay for an Xpass gym membership with Apple Pay on iPhone and iPad. Tap Pay with Apple
        Pay to open checkout and complete payment with a card saved in Wallet.
      </Text>
      <WalletPayButton method="apple_pay" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
});
