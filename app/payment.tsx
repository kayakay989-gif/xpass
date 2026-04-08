/**
 * Subscription checkout: Mastercard (MPGS) via tRPC `payments.checkout`.
 * WebViews on native are only for issuer 3-D Secure challenges, not third-party payment pages.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { ArrowLeft, CreditCard, CheckCircle2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { config } from '@/lib/config';
import Toast, { ToastType } from '@/components/Toast';
import { isSubscriptionActiveForMember } from '@/lib/subscription-active';
import { paramFirst } from '@/lib/expo-router-params';

export default function PaymentScreen() {
  const rawParams = useLocalSearchParams<{ tier?: string | string[]; duration?: string | string[]; price?: string | string[] }>();
  const tier = paramFirst(rawParams.tier);
  const duration = paramFirst(rawParams.duration);
  const price = paramFirst(rawParams.price);
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const effectiveUserId = firebaseUser?.uid ?? user?.id ?? null;
  const { subscriptionQuery } = useApp();
  const insets = useSafeAreaInsets();

  const tierOk = typeof tier === 'string' && tier.trim().length > 0;
  const durationOk = typeof duration === 'string' && duration.trim().length > 0;

  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [cardNumber, setCardNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [cardholderName, setCardholderName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [methodHtml, setMethodHtml] = useState<string | null>(null);
  const [challengeHtml, setChallengeHtml] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [authTransactionId, setAuthTransactionId] = useState<string | null>(null);
  const finalizeSentRef = useRef(false);
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string>('');
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(false);
  const [useWallet, setUseWallet] = useState<boolean>(false);
  // Card payments only
  const [paymentMethod] = useState<'card'>('card');
  const [saveCard, setSaveCard] = useState<boolean>(false);
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<any[]>([]);

  // Toast state for success / error messages
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');

  const validateCouponQuery = trpc.coupons.validate.useQuery(
    {
      code: couponCode.toUpperCase().trim(),
      originalPrice: parseFloat(price) || 0,
    },
    {
      enabled: false, // Manual trigger
      retry: false,
    }
  );

  const checkoutMutation = trpc.payments.checkout.useMutation({
    onError: (error) => {
      console.error('[Payment] Checkout mutation error:', error);

      setPaymentProcessing(false);
      setStatusMessage('');

      const message = error.message || 'Failed to process payment. Please try again.';
      const anyErr = error as any;
      const structured =
        anyErr?.cause?.error ||
        anyErr?.data?.error ||
        anyErr?.json?.error?.cause?.error ||
        anyErr?.json?.error?.data?.error;

      if (__DEV__) {
        console.log('[Payment] tRPC error details:', {
          message: error.message,
          data: anyErr?.data,
          shape: anyErr?.shape,
          cause: anyErr?.cause,
          structured,
        });
      }

      if (
        structured?.type === 'payment_declined' ||
        message.includes('Your bank declined the payment') ||
        message.includes('Payment blocked by issuer')
      ) {
        Alert.alert(
          'Payment Declined',
          structured?.message ||
            'Your bank declined the payment. Try another card or contact your bank.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Network / gateway / unknown failure
      Alert.alert(
        'Payment Error',
        message.includes('temporarily unavailable') || message.includes('gateway')
          ? 'We could not reach the payment service. Please check your connection and try again.'
          : message,
        [{ text: 'OK' }]
      );
    },
    onSuccess: async (data: any) => {
      console.log('[Payment] Checkout mutation success:', data);

      // Check if 3DS authentication is required
      if (data.requires3DS && data.redirectHtml) {
        console.log('[Payment] 3DS challenge required, showing authentication page');
        finalizeSentRef.current = false; // New challenge => allow finalize again
        setOrderId(data.orderId);
        setAuthTransactionId(data.authenticationTransactionId);
        setChallengeHtml(data.redirectHtml);
        setPaymentProcessing(false);
        setStatusMessage('Please complete bank verification');
        return; // Don't proceed with success flow yet
      }

      setPaymentProcessing(false);
      setStatusMessage('');

      const subFromCheckout = data.subscription;

      const finishActiveMembership = async () => {
        try {
          await subscriptionQuery.refetch();
        } catch (e) {
          console.warn('[Payment] Post-success subscription refetch (non-fatal):', e);
        }
        setToastType('success');
        setToastMessage('Subscribed successfully! Your membership is now active.');
        setToastVisible(true);
        setTimeout(() => {
          router.replace('/(tabs)/home');
        }, 1200);
      };

      // Same contract as web: successful checkout returns the created subscription immediately.
      // Trust it first to avoid races where verify/refetch lag behind Firestore writes.
      if (data.success && isSubscriptionActiveForMember(subFromCheckout)) {
        if (__DEV__) {
          console.log('[Payment] Active membership from checkout payload (aligned with web/API)');
        }
        await finishActiveMembership();
        return;
      }

      try {
        const paymentOrderId = data.orderId ?? orderId;
        if (!paymentOrderId) {
          throw new Error('Missing orderId from backend payment result');
        }

        const verification = await verifyPaymentMutation.mutateAsync({
          userId: effectiveUserId!,
          orderId: paymentOrderId,
          paymentTransactionId: data.paymentTransactionId ?? '2',
        });

        if (!verification?.confirmed) {
          if (isSubscriptionActiveForMember(subFromCheckout)) {
            console.warn(
              '[Payment] payments.verify not confirmed but checkout included active subscription; proceeding'
            );
            await finishActiveMembership();
            return;
          }
          throw new Error(
            `Payment not confirmed by backend (status=${String(verification?.status || 'unknown')})`
          );
        }

        const result = await subscriptionQuery.refetch();
        const sub = result.data;

        if (isSubscriptionActiveForMember(sub) || isSubscriptionActiveForMember(subFromCheckout)) {
          await finishActiveMembership();
          return;
        }

        console.warn('[Payment] Subscription not active after verify + refetch:', { sub, subFromCheckout });
        Alert.alert(
          'Subscription Pending',
          'Your payment was successful, but we could not confirm your subscription is active yet. Please refresh the app or contact support.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/home'),
            },
          ]
        );
      } catch (verifyError: any) {
        if (isSubscriptionActiveForMember(subFromCheckout)) {
          console.warn(
            '[Payment] verify/refetch error but checkout subscription looks active; proceeding:',
            verifyError
          );
          await finishActiveMembership();
          return;
        }
        console.error('[Payment] Failed to verify subscription after payment:', verifyError);
        Alert.alert(
          'Subscription Error',
          'Payment succeeded but we could not verify your subscription. Please refresh the app or contact support.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/home'),
            },
          ]
        );
      }
    },
  });

  // Strict backend confirmation (used after 3DS so we don't show success until backend confirms).
  const verifyPaymentMutation = trpc.payments.verify.useMutation();

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(' ') : cleaned;
  };

  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.substring(0, 2) + '/' + cleaned.substring(2, 4);
    }
    return cleaned;
  };

  const isCardValid = () => {
    // If using saved card, only CVV is required
    if (selectedSavedCardId) {
      return cvv.length >= 3;
    }
    
    // For new card, all fields required
    const cleanCardNumber = cardNumber.replace(/\s/g, '');
    return (
      cleanCardNumber.length >= 14 &&
      cleanCardNumber.length <= 19 &&
      expiryDate.length === 5 &&
      cvv.length >= 3 &&
      cardholderName.length > 0
    );
  };

  const redirectUrl = useMemo(() => {
    if (!config.api.baseUrl) return '';
    return `${config.api.baseUrl.replace(/\/+$/, '')}/api/3ds/callback`;
  }, []);

  const parsedExpiry = useMemo(() => {
    const [month, year] = expiryDate.split('/');
    // Mastercard gateway expects 2-digit year (YY), not 4-digit (YYYY)
    return { month, year: year || '' };
  }, [expiryDate]);

  // Load saved cards for the user
  useEffect(() => {
    if (user?.savedCards && user.savedCards.length > 0) {
      setSavedCards(user.savedCards);
    } else {
      setSavedCards([]);
    }
  }, [user]);

  // Google Pay and Apple Pay removed - card payments only

  // Apple Pay and Google Pay handlers removed - card payments only

  const handleFreeCheckout = async () => {
    if (!appliedCoupon || !appliedCoupon.isFree) {
      return;
    }

    setPaymentProcessing(true);
    setStatusMessage('Activating subscription...');

    try {
      const orderId = `order-${Date.now()}`;
      
      await checkoutMutation.mutateAsync({
        userId: effectiveUserId!,
        tier: tier as any,
        duration: parseInt(duration) as any,
        useWallet: true,
        paymentMethod: 'card', // Will be ignored since remainingAmount is 0
        couponCode: appliedCoupon.coupon.code,
        currency: 'JOD',
      });
    } catch (error: any) {
      setPaymentProcessing(false);
      setStatusMessage('');
      Alert.alert('Error', error.message || 'Failed to activate subscription');
    }
  };

  const handlePayment = async () => {
    console.log('[Payment] Button clicked!', {
      isCardValid: isCardValid(),
      hasUser: !!user,
      paymentProcessing,
      cardNumberLength: cardNumber.replace(/\s/g, '').length,
      expiryDate,
      cvvLength: cvv.length,
      cardholderNameLength: cardholderName.length,
      hasCoupon: !!appliedCoupon,
      isFree: appliedCoupon?.isFree,
    });

    // If 100% discount, skip payment gateway
    if (appliedCoupon?.isFree) {
      await handleFreeCheckout();
      return;
    }

    // If wallet covers full amount, skip card payment
    if (cardAmount === 0 && walletUsed > 0) {
      setPaymentProcessing(true);
      setStatusMessage('Processing wallet payment...');
      try {
        const orderId = `order-${Date.now()}`;
        await checkoutMutation.mutateAsync({
          userId: effectiveUserId!,
          tier: tier as any,
          duration: parseInt(duration) as any,
          useWallet: true,
          paymentMethod: 'card', // Will be ignored since remainingAmount is 0
          couponCode: appliedCoupon?.coupon?.code || undefined,
          currency: 'JOD',
        });
      } catch (error: any) {
        setPaymentProcessing(false);
        setStatusMessage('');
        Alert.alert('Error', error.message || 'Failed to process wallet payment');
      }
      return;
    }

    if (!isCardValid()) {
      console.warn('[Payment] Card validation failed');
      if (selectedSavedCardId) {
        Alert.alert('Error', 'Please enter CVV for your saved card');
      } else {
        Alert.alert('Error', 'Please complete all card details');
      }
      return;
    }

    // Explicit CVV validation - ensure CVV is not empty
    if (!cvv || cvv.trim().length < 3) {
      console.warn('[Payment] CVV validation failed - CVV is empty or too short');
      Alert.alert('Error', 'Please enter a valid CVV (3-4 digits)');
      return;
    }

    if (!effectiveUserId) {
      console.warn('[Payment] No authenticated user id (Firestore profile may still be loading)');
      Alert.alert('Error', 'Please log in to make a payment');
      return;
    }

    console.log('[Payment] Starting payment process...', {
      userId: effectiveUserId,
      tier,
      duration,
      cardNumberLength: cardNumber.replace(/\s/g, '').length,
      hasExpiry: !!expiryDate,
      cvvLength: cvv ? cvv.length : 0,
      cvvValue: cvv ? `${cvv.substring(0, 1)}**` : 'empty', // Log first digit only for debugging
      hasName: !!cardholderName,
      selectedSavedCardId,
      apiBaseUrl: config.api.baseUrl,
    });

    // Check if API is configured
    if (!config.api.baseUrl) {
      Alert.alert(
        'Configuration Error',
        'API server URL is not configured. Please set EXPO_PUBLIC_RORK_API_BASE_URL environment variable.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Try to ping the API server to see if it's running
    try {
      const healthCheckUrl = `${config.api.baseUrl}/`;
      console.log('[Payment] Checking API server connectivity...', healthCheckUrl);
      
      // Create timeout manually for compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const healthResponse = await fetch(healthCheckUrl, { 
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('[Payment] API server health check:', healthResponse.status);
    } catch (healthError: any) {
      console.error('[Payment] API server health check failed:', healthError);
      const errorMsg = healthError.name === 'AbortError' 
        ? 'Server did not respond in time'
        : healthError.message || 'Unknown error';
      
      Alert.alert(
        'Server Not Running',
        `Cannot connect to API server at ${config.api.baseUrl}.\n\nError: ${errorMsg}\n\nPlease make sure the backend server is running:\n\nnpm run start-server\n\nOr check if the server URL is correct.`,
        [{ text: 'OK' }]
      );
      setPaymentProcessing(false);
      return;
    }

    setPaymentProcessing(true);
    setStatusMessage('Processing payment...');

    try {
      const cleanedCard = cardNumber.replace(/\s/g, '');
      const { month, year } = parsedExpiry;

      // Use unified checkout endpoint
      // Ensure CVV is trimmed and has value (validation already checked above)
      const trimmedCvv = cvv.trim();
      if (!trimmedCvv || trimmedCvv.length < 3) {
        throw new Error('CVV is required and must be at least 3 digits');
      }

      await checkoutMutation.mutateAsync({
        userId: effectiveUserId!,
        tier: tier as any,
        duration: parseInt(duration) as any,
        useWallet: useWallet,
        paymentMethod: 'card',
        cardNumber: selectedSavedCardId ? undefined : cleanedCard, // Don't send card number if using saved card
        expiryMonth: selectedSavedCardId ? undefined : month,
        expiryYear: selectedSavedCardId ? undefined : year,
        cardholderName: selectedSavedCardId ? undefined : cardholderName,
        cvv: trimmedCvv, // Always send CVV as string (required for both new and saved cards)
        savedCardId: selectedSavedCardId || undefined, // Send saved card ID if using saved card
        saveCard: saveCard && !selectedSavedCardId, // Only save if it's a new card
        couponCode: appliedCoupon?.coupon?.code || undefined,
        currency: 'JOD',
      });
    } catch (error: any) {
      console.error('[Payment] Checkout error:', error);
      setPaymentProcessing(false);
      setStatusMessage('');
      Alert.alert('Payment Failed', error.message || 'Failed to process payment. Please try again.');
    }
  };

  // Handle finalizing payment after 3DS authentication
  const handleFinalizePayment = useCallback(
    async (
      finalOrderId: string,
      finalAuthTransactionId: string,
      authStatus: string
    ) => {
    console.log('[Payment] Finalizing payment after 3DS:', {
      orderId: finalOrderId,
      authTransactionId: finalAuthTransactionId,
      authStatus,
    });

    if (!effectiveUserId) {
      Alert.alert('Error', 'Please log in to complete payment');
      return;
    }

    setPaymentProcessing(true);
    setStatusMessage('Completing payment...');

    try {
      const cleanedCard = cardNumber.replace(/\s/g, '');
      const { month, year } = parsedExpiry;
      const trimmedCvv = cvv.trim();

      // Call checkout again with authentication details
      await checkoutMutation.mutateAsync({
        userId: effectiveUserId,
        orderId: finalOrderId,
        tier: tier as any,
        duration: parseInt(duration) as any,
        useWallet: useWallet,
        paymentMethod: 'card',
        cardNumber: selectedSavedCardId ? undefined : cleanedCard,
        expiryMonth: selectedSavedCardId ? undefined : month,
        expiryYear: selectedSavedCardId ? undefined : year,
        cardholderName: selectedSavedCardId ? undefined : cardholderName,
        cvv: trimmedCvv,
        savedCardId: selectedSavedCardId || undefined,
        saveCard: saveCard && !selectedSavedCardId,
        authenticationTransactionId: finalAuthTransactionId,
        authenticationStatus: authStatus,
        couponCode: appliedCoupon?.coupon?.code || undefined,
        currency: 'JOD',
      });
    } catch (error: any) {
      console.error('[Payment] Failed to finalize payment after 3DS:', error);
      setPaymentProcessing(false);
      setStatusMessage('');
      finalizeSentRef.current = false; // Allow retry if finalize failed
      Alert.alert('Payment Failed', error.message || 'Failed to complete payment after authentication. Please try again.');
    }
    },
    [
      effectiveUserId,
      user,
      cardNumber,
      parsedExpiry,
      cvv,
      selectedSavedCardId,
      cardholderName,
      tier,
      duration,
      useWallet,
      saveCard,
      appliedCoupon,
      checkoutMutation,
    ]
  );

  // Web: Mastercard 3DS callback posts a `message` event to the parent window.
  useEffect(() => {
    const handler = (event: any) => {
      try {
        // Only available in web builds (iframe + postMessage).
        if (typeof window === 'undefined') return;

        const data =
          typeof event?.data === 'string' ? JSON.parse(event.data) : event.data;

        if (data?.type === '3DS_AUTH_COMPLETE') {
          const finalOrderId = data.orderId ?? orderId;
          const finalAuthTransactionId = data.authTransactionId ?? authTransactionId;

          if (!finalOrderId || !finalAuthTransactionId) return;

          if (finalizeSentRef.current) return;
          finalizeSentRef.current = true;

          if (__DEV__) {
            console.log('[Payment] 3DS_AUTH_COMPLETE received via window message', {
              finalOrderId,
              finalAuthTransactionId,
              result: data?.result,
            });
          }

          setChallengeHtml(null);
          handleFinalizePayment(finalOrderId, finalAuthTransactionId, data.result || 'Y');
        }
      } catch (e) {
        // Ignore non-JSON or unrelated messages
      }
    };

    const finalizeSentRefLocal = finalizeSentRef.current;
    if (finalizeSentRefLocal) {
      // no-op; reference already set
    }

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [orderId, authTransactionId, handleFinalizePayment]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }

    setIsValidatingCoupon(true);
    setCouponError('');

    try {
      const result = await validateCouponQuery.refetch();
      const data = result.data;

      if (data?.valid) {
        setAppliedCoupon(data);
        setCouponError('');
      } else {
        setAppliedCoupon(null);
        setCouponError(data && 'valid' in data && !data.valid && 'error' in data ? data.error : 'Invalid coupon code');
      }
    } catch (error: any) {
      setAppliedCoupon(null);
      setCouponError(error.message || 'Failed to validate coupon');
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
  };

  const getFinalPrice = () => {
    if (appliedCoupon) {
      return appliedCoupon.finalPrice;
    }
    return parseFloat(price) || 0;
  };

  // Calculate wallet usage
  const walletBalance = user?.walletBalance || 0;
  const packagePrice = getFinalPrice();
  const walletUsed = useWallet ? Math.min(walletBalance, packagePrice) : 0;
  const cardAmount = Math.max(0, packagePrice - walletUsed);
  const remainingWalletBalance = walletBalance - walletUsed;

  const getTierName = () => {
    const tierNames: Record<string, string> = {
      silver: 'Silver Package',
      gold: 'Gold Package',
      diamond: 'Diamond Package',
      elite: 'Elite Package',
    };
    return tierNames[String(tier).toLowerCase()] || tier;
  };

  if (!tierOk || !durationOk) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: Colors.text, marginBottom: 8 }}>
          Missing package details
        </Text>
        <Text style={{ fontSize: 15, color: Colors.textSecondary, marginBottom: 20 }}>
          Go back and choose a subscription plan again.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
          onPress={() => router.back()}
        >
          <Text style={{ color: Colors.white, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!effectiveUserId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: Colors.textSecondary, marginBottom: 16 }}>
          Signing you in… If this persists, return to login.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
          onPress={() => router.replace('/login')}
        >
          <Text style={{ color: Colors.white, fontWeight: '600' }}>Go to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F9FAFB' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Toast
          message={toastMessage}
          type={toastType}
          visible={toastVisible}
          onClose={() => setToastVisible(false)}
        />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summaryCard}>
            <CreditCard size={48} color={Colors.primary} style={styles.icon} />
            <Text style={styles.packageName}>{getTierName()}</Text>
            <Text style={styles.durationText}>{duration} Month{parseInt(duration) > 1 ? 's' : ''}</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>Total Amount</Text>
              <Text style={styles.price}>{price} JOD</Text>
            </View>

            {/* Coupon Section */}
            <View style={styles.couponSection}>
              <Text style={styles.couponLabel}>Have a coupon code?</Text>
              <View style={styles.couponInputRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Enter coupon code"
                  placeholderTextColor="#9CA3AF"
                  value={couponCode}
                  onChangeText={(text) => {
                    setCouponCode(text.toUpperCase());
                    setCouponError('');
                    setAppliedCoupon(null);
                  }}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.applyButton, isValidatingCoupon && styles.applyButtonDisabled]}
                  onPress={handleApplyCoupon}
                  disabled={!couponCode.trim() || isValidatingCoupon}
                >
                  {isValidatingCoupon ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.applyButtonText}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
              {couponError ? (
                <Text style={styles.couponError}>{couponError}</Text>
              ) : null}
              {appliedCoupon && (
                <View style={styles.couponApplied}>
                  <Text style={styles.couponAppliedText}>
                    ✓ {appliedCoupon.coupon.code} applied ({appliedCoupon.coupon.discountPercent}% off)
                  </Text>
                  <TouchableOpacity onPress={handleRemoveCoupon}>
                    <Text style={styles.removeCouponText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Price Breakdown */}
            {appliedCoupon && (
              <View style={styles.priceBreakdown}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceBreakdownLabel}>Original Price:</Text>
                  <Text style={styles.priceBreakdownValue}>{price} JOD</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceBreakdownLabel}>Discount ({appliedCoupon.coupon.discountPercent}%):</Text>
                  <Text style={[styles.priceBreakdownValue, styles.discountValue]}>
                    -{appliedCoupon.discountAmount.toFixed(2)} JOD
                  </Text>
                </View>
                <View style={[styles.priceRow, styles.finalPriceRow]}>
                  <Text style={styles.finalPriceLabel}>Final Price:</Text>
                  <Text style={styles.finalPriceValue}>
                    {appliedCoupon.finalPrice.toFixed(2)} JOD
                  </Text>
                </View>
                {appliedCoupon.isFree && (
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>🎉 No payment required!</Text>
                  </View>
                )}
              </View>
            )}

            {appliedCoupon?.isFree && user && (
              <TouchableOpacity
                style={[styles.payButton, paymentProcessing && styles.payButtonDisabled]}
                onPress={() => handleFreeCheckout()}
                disabled={paymentProcessing}
                activeOpacity={0.7}
              >
                {paymentProcessing ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.payButtonText}>Activate free subscription</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Wallet Section */}
            {walletBalance > 0 && !appliedCoupon?.isFree && (
              <View style={styles.walletSection}>
                <View style={styles.walletHeader}>
                  <Text style={styles.walletLabel}>Wallet Balance: {walletBalance.toFixed(2)} JOD</Text>
                  <TouchableOpacity
                    style={styles.walletToggle}
                    onPress={() => setUseWallet(!useWallet)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.toggle, useWallet && styles.toggleActive]}>
                      {useWallet && <View style={styles.toggleIndicator} />}
                    </View>
                    <Text style={styles.walletToggleText}>Use wallet balance</Text>
                  </TouchableOpacity>
                </View>
                {useWallet && (
                  <View style={styles.walletDetails}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceBreakdownLabel}>Wallet Contribution:</Text>
                      <Text style={[styles.priceBreakdownValue, styles.walletValue]}>
                        {walletUsed.toFixed(2)} JOD
                      </Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceBreakdownLabel}>Remaining to pay:</Text>
                      <Text style={[styles.priceBreakdownValue, styles.cardValue]}>
                        {cardAmount.toFixed(2)} JOD
                      </Text>
                    </View>
                    {remainingWalletBalance > 0 && (
                      <View style={styles.priceRow}>
                        <Text style={styles.priceBreakdownLabel}>Remaining wallet balance:</Text>
                        <Text style={styles.priceBreakdownValue}>
                          {remainingWalletBalance.toFixed(2)} JOD
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {!appliedCoupon?.isFree && cardAmount > 0 && (
            <>
              {/* VERSION 1: Payment Method Selection - Only Card Payment Enabled */}
              {/* Apple Pay and Google Pay are hidden for Version 1 but code remains for Version 2 */}
              {/* 
              <View style={styles.paymentMethodSection}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                
                {applePayAvailable && (
                  <TouchableOpacity
                    style={[
                      styles.paymentMethodOption,
                      paymentMethod === 'apple_pay' && styles.paymentMethodOptionSelected,
                    ]}
                    onPress={() => setPaymentMethod('apple_pay')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radioButton}>
                      {paymentMethod === 'apple_pay' && <View style={styles.radioButtonInner} />}
                    </View>
                    <Text style={styles.paymentMethodLabel}>Apple Pay</Text>
                    {Platform.OS === 'web' && (
                      <View style={styles.applePayBadge}>
                        <Text style={styles.applePayBadgeText}>🍎</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {googlePayAvailable && (
                  <TouchableOpacity
                    style={[
                      styles.paymentMethodOption,
                      paymentMethod === 'google_pay' && styles.paymentMethodOptionSelected,
                    ]}
                    onPress={() => setPaymentMethod('google_pay')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.radioButton}>
                      {paymentMethod === 'google_pay' && <View style={styles.radioButtonInner} />}
                    </View>
                    <Text style={styles.paymentMethodLabel}>Google Pay</Text>
                    {Platform.OS === 'web' && (
                      <View style={styles.googlePayBadge}>
                        <Text style={styles.googlePayBadgeText}>G</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.paymentMethodOption,
                    paymentMethod === 'card' && styles.paymentMethodOptionSelected,
                  ]}
                  onPress={() => setPaymentMethod('card')}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioButton}>
                    {paymentMethod === 'card' && <View style={styles.radioButtonInner} />}
                  </View>
                  <Text style={styles.paymentMethodLabel}>Credit / Debit Card</Text>
                </TouchableOpacity>
              </View>
              */}

              {/* Saved Cards Selection */}
              {savedCards.length > 0 && (
                <View style={styles.savedCardsSection}>
                  <Text style={styles.sectionTitle}>Saved Cards</Text>
                  {savedCards.map((card) => (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        styles.savedCardOption,
                        selectedSavedCardId === card.id && styles.savedCardOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedSavedCardId(card.id);
                        // Clear card input fields when using saved card
                        setCardNumber('');
                        setExpiryDate('');
                        setCvv('');
                        setCardholderName(card.cardholderName || '');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {selectedSavedCardId === card.id && <View style={styles.radioButtonInner} />}
                      </View>
                      <View style={styles.savedCardInfo}>
                        <Text style={styles.savedCardLabel}>
                          {card.brand || 'Card'} •••• {card.last4}
                        </Text>
                        {card.expiryMonth && card.expiryYear && (
                          <Text style={styles.savedCardExpiry}>
                            Expires {card.expiryMonth}/{card.expiryYear}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.useNewCardButton}
                    onPress={() => {
                      setSelectedSavedCardId(null);
                      setCardNumber('');
                      setExpiryDate('');
                      setCvv('');
                      setCardholderName('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.useNewCardText}>+ Use New Card</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* CVV Field for Saved Cards */}
              {selectedSavedCardId && (
                <View style={styles.cardFieldContainer}>
                  <Text style={styles.label}>CVV</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    placeholderTextColor={Colors.textSecondary}
                    value={cvv}
                    onChangeText={(text) => {
                      if (text.length <= 4 && /^\d*$/.test(text)) {
                        setCvv(text);
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    returnKeyType="done"
                    testID="cvv-input-saved-card"
                  />
                  <Text style={styles.hint}>
                    Enter CVV for your saved card ending in {savedCards.find(c => c.id === selectedSavedCardId)?.last4}
                  </Text>
                </View>
              )}

              {/* Card Fields - Show when no saved card selected */}
              {!selectedSavedCardId && (
                <>
                  <View style={styles.cardFieldContainer}>
                    <Text style={styles.label}>Cardholder Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="John Smith"
                  placeholderTextColor={Colors.textSecondary}
                  value={cardholderName}
                  onChangeText={setCardholderName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  testID="cardholder-name-input"
                  editable={!selectedSavedCardId}
                />
              </View>

              <View style={styles.cardFieldContainer}>
                <Text style={styles.label}>Card Number</Text>
            <TextInput
              style={styles.input}
              placeholder="4242 4242 4242 4242"
              placeholderTextColor={Colors.textSecondary}
              value={cardNumber}
              onChangeText={(text) => {
                const cleaned = text.replace(/\s/g, '');
                if (cleaned.length <= 19 && /^\d*$/.test(cleaned)) {
                  setCardNumber(formatCardNumber(cleaned));
                }
              }}
              keyboardType="number-pad"
              maxLength={23}
              returnKeyType="next"
              testID="card-number-input"
            />
            {__DEV__ && (
              <Text style={styles.hint}>
                Note: This is currently in test mode. Use any valid card number for testing.
              </Text>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.cardFieldContainer, { flex: 1, marginRight: 12 }]}>
              <Text style={styles.label}>Expiry Date</Text>
              <TextInput
                style={styles.input}
                placeholder="MM/YY"
                placeholderTextColor={Colors.textSecondary}
                value={expiryDate}
                onChangeText={(text) => {
                  const cleaned = text.replace(/\D/g, '');
                  if (cleaned.length <= 4) {
                    setExpiryDate(formatExpiryDate(cleaned));
                  }
                }}
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="next"
                testID="expiry-date-input"
              />
            </View>

            <View style={[styles.cardFieldContainer, { flex: 1 }]}>
              <Text style={styles.label}>CVV</Text>
              <TextInput
                style={styles.input}
                placeholder="123"
                placeholderTextColor={Colors.textSecondary}
                value={cvv}
                onChangeText={(text) => {
                  if (text.length <= 4 && /^\d*$/.test(text)) {
                    setCvv(text);
                  }
                }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                returnKeyType="done"
                testID="cvv-input"
              />
            </View>
          </View>

                  {/* Save Card Option - Only show when entering new card */}
                  {!selectedSavedCardId && (
                    <View style={styles.saveCardContainer}>
                      <TouchableOpacity
                        style={styles.saveCardCheckbox}
                        onPress={() => setSaveCard(!saveCard)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, saveCard && styles.checkboxChecked]}>
                          {saveCard && <Text style={styles.checkboxCheckmark}>✓</Text>}
                        </View>
                        <Text style={styles.saveCardLabel}>Save this card for future payments</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              {/* VERSION 1: Apple Pay and Google Pay buttons hidden - code preserved for Version 2 */}
              {/* 
              {cardAmount > 0 && (applePayAvailable || googlePayAvailable) && (
                <View style={styles.quickPaymentSection}>
                  <Text style={styles.quickPaymentTitle}>Quick Payment Options</Text>
                  
                  {applePayAvailable && (
                    <View style={styles.applePayButtonContainer}>
                      <TouchableOpacity
                        style={styles.applePayButton}
                        onPress={handleApplePayPayment}
                        disabled={paymentProcessing}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.applePayButtonText}>🍎 Pay with Apple Pay</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {googlePayAvailable && (
                    <View style={styles.googlePayButtonContainer}>
                      <TouchableOpacity
                        style={styles.googlePayButton}
                        onPress={handleGooglePayPayment}
                        disabled={paymentProcessing}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.googlePayButtonText}>G Pay with Google Pay</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              */}
            </>
          )}

          {/* Payment Summary */}
          {!appliedCoupon?.isFree && (
            <View style={styles.paymentSummary}>
              <Text style={styles.paymentSummaryTitle}>Payment Summary</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceBreakdownLabel}>Subscription Price:</Text>
                <Text style={styles.priceBreakdownValue}>{packagePrice.toFixed(2)} JOD</Text>
              </View>
              {walletUsed > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceBreakdownLabel}>Wallet Used:</Text>
                  <Text style={[styles.priceBreakdownValue, styles.walletValue]}>
                    {walletUsed.toFixed(2)} JOD
                  </Text>
                </View>
              )}
              {cardAmount > 0 && (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceBreakdownLabel}>External Payment:</Text>
                    <Text style={[styles.priceBreakdownValue, styles.cardValue]}>
                      {cardAmount.toFixed(2)} JOD
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceBreakdownLabel}>Payment Method:</Text>
                    <Text style={styles.priceBreakdownValue}>
                      Credit / Debit Card
                    </Text>
                  </View>
                </>
              )}
              {cardAmount === 0 && walletUsed > 0 && (
                <View style={styles.fullWalletBadge}>
                  <Text style={styles.fullWalletBadgeText}>✓ Fully paid with wallet</Text>
                </View>
              )}
            </View>
          )}

          {/* Card Payment Button - Only show when card method is selected */}
          {!appliedCoupon?.isFree && cardAmount > 0 && paymentMethod === 'card' && (
            <TouchableOpacity
              style={[
                styles.payButton,
                (!isCardValid() || paymentProcessing) && styles.payButtonDisabled,
              ]}
              onPress={() => {
                console.log('[Payment] TouchableOpacity onPress triggered');
                console.log('[Payment] Button state:', {
                  isCardValid: isCardValid(),
                  paymentProcessing,
                  hasFreeCoupon: appliedCoupon?.isFree,
                  disabled: (!isCardValid() || paymentProcessing),
                });
                if (!isCardValid() || paymentProcessing) {
                  console.warn('[Payment] Button is disabled, ignoring press');
                  return;
                }
                handlePayment().catch((error) => {
                  console.error('[Payment] Unhandled error in handlePayment:', error);
                  setPaymentProcessing(false);
                  setStatusMessage('');
                });
              }}
              onPressIn={() => {
                console.log('[Payment] Button pressed in - touch detected');
              }}
              disabled={!isCardValid() || paymentProcessing}
              testID="pay-button"
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {paymentProcessing ? (
                <>
                  <ActivityIndicator size="small" color={Colors.white} />
                  <Text style={styles.payButtonText}>{statusMessage || 'Processing...'}</Text>
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} color={Colors.white} />
                  <Text style={styles.payButtonText}>
                    Pay {cardAmount.toFixed(2)} JOD{walletUsed > 0 ? ` (${walletUsed.toFixed(2)} JOD from wallet)` : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Wallet-only Payment Button */}
          {!appliedCoupon?.isFree && cardAmount === 0 && walletUsed > 0 && (
            <TouchableOpacity
              style={[
                styles.payButton,
                paymentProcessing && styles.payButtonDisabled,
              ]}
              onPress={async () => {
                if (paymentProcessing) return;
                setPaymentProcessing(true);
                setStatusMessage('Processing wallet payment...');
                try {
                  await checkoutMutation.mutateAsync({
                    userId: effectiveUserId!,
                    tier: tier as any,
                    duration: parseInt(duration) as any,
                    currency: 'JOD',
                    couponCode: appliedCoupon?.coupon?.code || undefined,
                    useWallet: true,
                    paymentMethod: 'card', // Required by schema, but ignored when useWallet covers full amount
                  });
                } catch (error: any) {
                  setPaymentProcessing(false);
                  setStatusMessage('');
                  Alert.alert('Error', error.message || 'Failed to process wallet payment');
                }
              }}
              disabled={paymentProcessing}
              testID="wallet-pay-button"
              activeOpacity={0.7}
            >
              {paymentProcessing ? (
                <>
                  <ActivityIndicator size="small" color={Colors.white} />
                  <Text style={styles.payButtonText}>{statusMessage || 'Processing...'}</Text>
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} color={Colors.white} />
                  <Text style={styles.payButtonText}>
                    Activate Subscription ({walletUsed.toFixed(2)} JOD from wallet)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Debug info */}
          {__DEV__ && (
            <View style={{ padding: 10, backgroundColor: '#f0f0f0', marginTop: 10, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                Debug: Card Valid: {isCardValid() ? 'Yes' : 'No'} | Processing: {paymentProcessing ? 'Yes' : 'No'}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                Card: {cardNumber.replace(/\s/g, '').length} digits | Expiry: {expiryDate} | CVV: {cvv.length} | Name: {cardholderName.length} chars
              </Text>
            </View>
          )}

          {!appliedCoupon?.isFree && (
            <View style={styles.securityNote}>
              <Text style={styles.securityText}>🔒 Secure Payment</Text>
              <Text style={styles.securitySubtext}>Your payment information is encrypted and secure</Text>
            </View>
          )}
        </ScrollView>

        {methodHtml && Platform.OS !== 'web' && (
          <WebView
            originWhitelist={['*']}
            source={{ html: methodHtml }}
            style={{ width: 0, height: 0, opacity: 0 }}
            onLoadEnd={() => setStatusMessage('Issuer method completed')}
          />
        )}

        {challengeHtml && Platform.OS !== 'web' && (
          <View style={styles.challengeOverlay}>
            <Text style={styles.challengeTitle}>Complete bank verification</Text>
            <Text style={styles.challengeSubtitle}>Follow the steps from your bank to continue</Text>
            <WebView
              originWhitelist={['*']}
              source={{ html: challengeHtml }}
              style={styles.challengeWebview}
              onMessage={(event) => {
                try {
                  const message = typeof event.nativeEvent.data === 'string' 
                    ? JSON.parse(event.nativeEvent.data) 
                    : event.nativeEvent.data;
                  
                  if (
                    message?.type === '3DS_AUTH_COMPLETE' &&
                    orderId &&
                    authTransactionId &&
                    !finalizeSentRef.current
                  ) {
                    console.log('[Payment] 3DS authentication complete via message:', message);
                    finalizeSentRef.current = true;
                    setChallengeHtml(null);
                    // Complete payment with authentication
                    handleFinalizePayment(orderId, authTransactionId, message.result || 'Y');
                  }
                } catch (e) {
                  // If message is not JSON, check for string match
                  if (
                    event.nativeEvent.data === '3DS_AUTH_COMPLETE' &&
                    orderId &&
                    authTransactionId &&
                    !finalizeSentRef.current
                  ) {
                    console.log('[Payment] 3DS authentication complete via string message');
                    finalizeSentRef.current = true;
                    setChallengeHtml(null);
                    handleFinalizePayment(orderId, authTransactionId, 'Y');
                  }
                }
              }}
              onNavigationStateChange={(navState) => {
                if (
                  navState.url &&
                  redirectUrl &&
                  (navState.url.startsWith(redirectUrl) || navState.url.includes('/api/3ds/callback')) &&
                  orderId &&
                  authTransactionId &&
                  !finalizeSentRef.current
                ) {
                  console.log('[Payment] 3DS callback URL detected:', navState.url);
                  finalizeSentRef.current = true;
                  setChallengeHtml(null);
                  // After challenge completion, authentication status is typically 'Y' (successful)
                  handleFinalizePayment(orderId, authTransactionId, 'Y');
                }
              }}
            />
          </View>
        )}

        {challengeHtml && Platform.OS === 'web' && (
          <View style={styles.challengeOverlay}>
            <Text style={styles.challengeTitle}>Complete bank verification</Text>
            <Text style={styles.challengeSubtitle}>Follow the steps from your bank to continue</Text>
            <View style={styles.challengeWebview}>
              {/* srcDoc is required so the returned 3DS HTML actually executes in the iframe */}
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore */}
              <iframe
                title="3DS Challenge"
                style={{ width: '100%', height: '100%', border: 'none' }}
                srcDoc={challengeHtml}
              />
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    marginBottom: 16,
  },
  packageName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  durationText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  priceContainer: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  price: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  cardFieldContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  payButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
    minHeight: 56,
    elevation: 2, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  payButtonDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  securityNote: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  securityText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  securitySubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  challengeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000aa',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  challengeTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  challengeSubtitle: {
    color: Colors.white,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  challengeWebview: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
  },
  // Coupon styles
  couponSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  couponLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  couponInputRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 8,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.white,
  },
  applyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  couponError: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  couponApplied: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  couponAppliedText: {
    fontSize: 14,
    color: '#16A34A',
    fontWeight: '500' as const,
  },
  removeCouponText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600' as const,
  },
  priceBreakdown: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  priceBreakdownLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  priceBreakdownValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  discountValue: {
    color: '#16A34A',
  },
  finalPriceRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  finalPriceLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  finalPriceValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  freeBadge: {
    marginTop: 12,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  freeBadgeText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#92400E',
  },
  // Wallet styles
  walletSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  walletHeader: {
    marginBottom: 12,
  },
  walletLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  walletToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.border,
    justifyContent: 'center' as const,
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.white,
    alignSelf: 'flex-end' as const,
  },
  walletToggleText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  walletDetails: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  walletValue: {
    color: '#16A34A',
  },
  cardValue: {
    color: Colors.primary,
  },
  paymentSummary: {
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentSummaryTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  fullWalletBadge: {
    marginTop: 12,
    backgroundColor: '#D1FAE5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  fullWalletBadgeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#065F46',
  },
  // Payment method selection styles
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
  },
  paymentMethodSection: {
    marginTop: 24,
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentMethodOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  paymentMethodOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F3F4F6',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  paymentMethodLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
  },
  applePayBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  applePayBadgeText: {
    color: '#fff',
    fontSize: 14,
  },
  googlePayBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4285F4',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  googlePayBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  applePayButtonContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  applePayButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 56,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  applePayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  googlePayButtonContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  googlePayButton: {
    backgroundColor: '#4285F4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 56,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  googlePayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  quickPaymentSection: {
    marginTop: 24,
    marginBottom: 24,
    padding: 20,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickPaymentTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  // Saved Cards Styles
  savedCardsSection: {
    marginTop: 24,
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  savedCardOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  savedCardOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F3F4F6',
  },
  savedCardInfo: {
    flex: 1,
  },
  savedCardLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  savedCardExpiry: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  useNewCardButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  useNewCardText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  saveCardContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  saveCardCheckbox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.white,
  },
  checkboxChecked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  checkboxCheckmark: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  saveCardLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
});
