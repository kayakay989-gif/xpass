import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { trpc } from '@/lib/trpc';
import Colors from '@/constants/colors';
import { CheckCircle2 } from 'lucide-react-native';

type Props = {
  userId: string;
  tier: string;
  duration: number;
  useWallet: boolean;
  couponCode?: string;
  /** Primary button when card / external amount > 0 */
  mode: 'card' | 'walletOnly' | 'freeCoupon';
  cardAmount: number;
  walletUsed: number;
  disabled: boolean;
  onSubscriptionConfirmed: () => void;
};

/**
 * Uses Stripe PaymentSheet on native (must render under StripeProvider).
 */
export function NativeStripeCheckout({
  userId,
  tier,
  duration,
  useWallet,
  couponCode,
  mode,
  cardAmount,
  walletUsed,
  disabled,
  onSubscriptionConfirmed,
}: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const createSheet = trpc.payments.createPaymentSheet.useMutation();
  const finalize = trpc.payments.finalizeStripeSubscription.useMutation();

  const run = async () => {
    if (disabled || busy) return;
    setBusy(true);
    setStatus(
      mode === 'walletOnly' || mode === 'freeCoupon' ? 'Activating…' : 'Preparing secure checkout…'
    );
    try {
      const res = await createSheet.mutateAsync({
        userId,
        tier: tier as 'silver' | 'gold' | 'diamond' | 'elite',
        duration: duration as 1 | 3 | 6 | 9 | 12,
        useWallet,
        couponCode,
        currency: 'JOD',
      });

      if (res.completedWithoutSheet) {
        onSubscriptionConfirmed();
        return;
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Xpass',
        customerId: res.customer,
        customerEphemeralKeySecret: res.ephemeralKey,
        paymentIntentClientSecret: res.paymentIntent,
        returnURL: 'xpass://payment-complete',
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        Alert.alert('Payment', initError.message);
        return;
      }

      setStatus('Complete payment…');
      const { error: payError } = await presentPaymentSheet();

      if (payError) {
        if (payError.code !== 'Canceled') {
          Alert.alert('Payment', payError.message);
        }
        return;
      }

      await finalize.mutateAsync({
        userId,
        paymentIntentId: res.paymentIntentId,
      });

      onSubscriptionConfirmed();
    } catch (e: any) {
      Alert.alert('Payment', e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const showCardButton = mode === 'card' && cardAmount > 0;
  const showWalletButton = mode === 'walletOnly' && cardAmount === 0 && walletUsed > 0;
  const showFreeButton = mode === 'freeCoupon';

  if (!showCardButton && !showWalletButton && !showFreeButton) {
    return null;
  }

  let label = 'Pay securely';
  if (showCardButton) {
    label = `Pay ${cardAmount.toFixed(2)} JOD${walletUsed > 0 ? ` (${walletUsed.toFixed(2)} from wallet)` : ''}`;
  } else if (showWalletButton) {
    label = `Activate (${walletUsed.toFixed(2)} JOD from wallet)`;
  } else if (showFreeButton) {
    label = 'Activate subscription';
  }

  return (
    <TouchableOpacity
      style={[styles.payButton, (disabled || busy) && styles.payButtonDisabled]}
      onPress={() => run()}
      disabled={disabled || busy}
      activeOpacity={0.7}
    >
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={Colors.white} />
          <Text style={styles.payButtonText}>{status || 'Please wait…'}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <CheckCircle2 size={20} color={Colors.white} />
          <Text style={styles.payButtonText}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  payButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  payButtonDisabled: {
    opacity: 0.55,
  },
  payButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600' as const,
    marginLeft: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
