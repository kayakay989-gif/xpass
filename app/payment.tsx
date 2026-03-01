import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';
import { ArrowLeft, CreditCard, CheckCircle2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { config } from '@/lib/config';

export default function PaymentScreen() {
  const { tier, duration, price } = useLocalSearchParams<{ tier: string; duration: string; price: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

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
  const [showNativeContinueButton, setShowNativeContinueButton] = useState<boolean>(false);
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string>('');
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(false);

  const initiateAuthMutation = trpc.payments.initiate3ds.useMutation({
    onError: (error) => {
      console.error('[Payment] Initiate auth mutation error:', {
        message: error.message,
        data: error.data,
        shape: error.shape,
        cause: error.cause,
        stack: error.stack,
      });
      setPaymentProcessing(false);
      setStatusMessage('');
    },
    onSuccess: (data) => {
      console.log('[Payment] Initiate auth mutation success:', {
        orderId: data.orderId,
        transactionId: data.transactionId,
        hasMethodHtml: !!data.methodHtml,
        gatewayRecommendation: data.gatewayRecommendation,
      });
    },
    onMutate: (variables) => {
      console.log('[Payment] Initiate auth mutation starting with:', {
        userId: variables.userId,
        tier: variables.tier,
        duration: variables.duration,
        cardNumberLength: variables.cardNumber.length,
      });
    },
  });
  
  const authenticatePayerMutation = trpc.payments.authenticate3ds.useMutation({
    onError: (error) => {
      console.error('[Payment] Authenticate payer mutation error:', error);
      setPaymentProcessing(false);
      setStatusMessage('');
      Alert.alert(
        'Authentication Failed',
        error.message || 'Failed to authenticate payment. Please try again.',
        [{ text: 'OK' }]
      );
    },
    onSuccess: (data) => {
      console.log('[Payment] Authenticate payer mutation success:', data);
    },
  });
  
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

  const payWith3dsMutation = trpc.payments.payWith3ds.useMutation({
    onError: (error) => {
      console.error('[Payment] Pay with 3DS mutation error:', error);
      setPaymentProcessing(false);
      setStatusMessage('');
      Alert.alert(
        'Payment Failed',
        error.message || 'Failed to process payment. Please try again.',
        [{ text: 'OK' }]
      );
    },
    onSuccess: (data) => {
      console.log('[Payment] Pay with 3DS mutation success:', data);
      setPaymentProcessing(false);
      setStatusMessage('');
      
      if (data.isFree) {
        Alert.alert(
          'Subscription Activated',
          `Your ${tier} subscription has been activated for ${duration} month(s) using coupon!`,
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(tabs)/home'),
            },
          ]
        );
      } else {
        Alert.alert(
          'Payment Successful',
          `Your ${tier} subscription has been activated for ${duration} month(s)!`,
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

  // For native (non-web) 3DS challenge, provide a manual "Continue" button as a fallback
  // if the redirect/callback flow cannot return cleanly to the app.
  useEffect(() => {
    if (challengeHtml && Platform.OS !== 'web') {
      const timer = setTimeout(() => {
        setShowNativeContinueButton(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
    setShowNativeContinueButton(false);
  }, [challengeHtml]);

  const handleFinalizePayment = async (
    currentOrderId: string, 
    currentAuthTransactionId: string,
    authStatus?: string
  ) => {
    setStatusMessage('Capturing payment...');
    const cleanedCard = cardNumber.replace(/\s/g, '');
    const { month, year } = parsedExpiry;

    await payWith3dsMutation.mutateAsync({
      userId: user!.id,
      tier: tier as any,
      duration: parseInt(duration) as any,
      orderId: currentOrderId,
      authenticationTransactionId: currentAuthTransactionId,
      authenticationStatus: authStatus, // Pass the 3DS authentication status (Y, N, U, I, A)
      cardNumber: cleanedCard,
      expiryMonth: month,
      expiryYear: year,
      currency: 'JOD',
      couponCode: appliedCoupon?.coupon?.code || undefined,
    });
  };

  const handleFreeCheckout = async () => {
    if (!appliedCoupon || !appliedCoupon.isFree) {
      return;
    }

    setPaymentProcessing(true);
    setStatusMessage('Activating subscription...');

    try {
      const orderId = `order-${Date.now()}`;
      
      await payWith3dsMutation.mutateAsync({
        userId: user!.id,
        tier: tier as any,
        duration: parseInt(duration) as any,
        orderId,
        authenticationTransactionId: '',
        currency: 'JOD',
        couponCode: appliedCoupon.coupon.code,
        // No card details needed for 100% discount
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

    if (!isCardValid()) {
      console.warn('[Payment] Card validation failed');
      Alert.alert('Error', 'Please complete all card details');
      return;
    }

    if (!user) {
      console.warn('[Payment] No user found');
      Alert.alert('Error', 'Please log in to make a payment');
      return;
    }

    console.log('[Payment] Starting payment process...', {
      userId: user.id,
      tier,
      duration,
      cardNumberLength: cardNumber.replace(/\s/g, '').length,
      hasExpiry: !!expiryDate,
      hasCvv: !!cvv,
      hasName: !!cardholderName,
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
    setStatusMessage('Starting authentication...');

    try {
      const cleanedCard = cardNumber.replace(/\s/g, '');
      const { month, year } = parsedExpiry;

      console.log('[Payment] Step 1: Initiating 3DS authentication...', {
        userId: user.id,
        tier,
        duration: parseInt(duration),
        cardNumberPrefix: cleanedCard.substring(0, 6) + '****',
        currency: 'JOD',
        apiBaseUrl: config.api.baseUrl,
      });

      console.log('[Payment] About to call initiateAuthMutation.mutateAsync');
      console.log('[Payment] tRPC client URL should be:', `${config.api.baseUrl}/trpc`);
      console.log('[Payment] Mutation payload:', {
        userId: user.id,
        tier,
        duration: parseInt(duration),
        cardNumberLength: cleanedCard.length,
        currency: 'JOD',
        hasMethodNotificationUrl: !!redirectUrl,
      });

      // Test the API endpoint directly first
      try {
        const testUrl = `${config.api.baseUrl}/trpc/payments.initiate3ds`;
        console.log('[Payment] Testing API endpoint:', testUrl);
      } catch (testError) {
        console.error('[Payment] Test error:', testError);
      }

      console.log('[Payment] Calling mutation now...');
      const startTime = Date.now();
      
      const initiate = await initiateAuthMutation.mutateAsync({
        userId: user!.id,
        tier: tier as any,
        duration: parseInt(duration) as any,
        cardNumber: cleanedCard,
        currency: 'JOD',
        methodNotificationUrl: redirectUrl,
      });

      const endTime = Date.now();
      console.log(`[Payment] Mutation completed in ${endTime - startTime}ms`);
      console.log('[Payment] Initiate response:', {
        orderId: initiate.orderId,
        transactionId: initiate.transactionId,
        hasMethodHtml: !!initiate.methodHtml,
        gatewayRecommendation: initiate.gatewayRecommendation,
      });

      setOrderId(initiate.orderId);
      setAuthTransactionId(initiate.transactionId);
      setStatusMessage('Running issuer checks...');

      if (initiate.methodHtml) {
        console.log('[Payment] Method HTML received, waiting for completion...');
        setMethodHtml(initiate.methodHtml);
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      console.log('[Payment] Step 2: Authenticating payer...');
      setStatusMessage('Authenticating...');
      const authenticate = await authenticatePayerMutation.mutateAsync({
        userId: user!.id,
        tier: tier as any,
        duration: parseInt(duration) as any,
        orderId: initiate.orderId,
        transactionId: initiate.transactionId,
        cardNumber: cleanedCard,
        expiryMonth: month,
        expiryYear: year,
        currency: 'JOD',
        redirectUrl,
        browserUserAgent: Platform.OS === 'web' ? navigator.userAgent : 'ReactNativeWebView',
        cardholderName,
      });

      console.log('[Payment] Authenticate response:', {
        gatewayRecommendation: authenticate.gatewayRecommendation,
        hasRedirectHtml: !!authenticate.redirectHtml,
        result: authenticate.result,
        authenticationStatus: authenticate.authenticationStatus,
        fullResponse: authenticate,
      });

      // Log the full response for debugging
      console.log('[Payment] Full authenticate response:', JSON.stringify(authenticate, null, 2));

      if (authenticate.redirectHtml) {
        console.log('[Payment] Challenge required - showing 3DS challenge');
        setStatusMessage('Challenge required - complete verification');
        setChallengeHtml(authenticate.redirectHtml);
        
        // On web, inject the HTML directly into an iframe with sandbox permissions
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          // Create a container for the 3DS challenge
          const container = document.createElement('div');
          container.id = 'threeds-challenge-container';
          container.style.position = 'fixed';
          container.style.top = '0';
          container.style.left = '0';
          container.style.width = '100%';
          container.style.height = '100%';
          container.style.zIndex = '9999';
          container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
          
          // Create iframe with sandbox that allows scripts
          const iframe = document.createElement('iframe');
          iframe.id = 'threeds-challenge-iframe';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups', 'allow-top-navigation');
          iframe.srcdoc = authenticate.redirectHtml;
          
          container.appendChild(iframe);
          document.body.appendChild(container);
          
          console.log('[Payment] 3DS challenge iframe created');
          
          // Listen for redirect via postMessage (for cross-origin)
          const messageHandler = (event: MessageEvent) => {
            console.log('[Payment] Received message from iframe:', event.data);
            if (event.data === '3DS_AUTH_COMPLETE' || event.origin.includes('mastercard.com')) {
              window.removeEventListener('message', messageHandler);
              if (document.body.contains(container)) {
                document.body.removeChild(container);
              }
              setChallengeHtml(null);
              // After challenge completion, authentication status is typically 'Y' (successful)
              handleFinalizePayment(initiate.orderId, initiate.transactionId, 'Y');
            }
          };
          window.addEventListener('message', messageHandler);
          
          // Check iframe location (for same-origin) - but expect cross-origin errors
          const checkInterval = setInterval(() => {
            try {
              if (iframe.contentWindow?.location.href.includes(redirectUrl || '')) {
                clearInterval(checkInterval);
                window.removeEventListener('message', messageHandler);
                if (document.body.contains(container)) {
                  document.body.removeChild(container);
                }
                setChallengeHtml(null);
                // After challenge completion, authentication status is typically 'Y' (successful)
                handleFinalizePayment(initiate.orderId, initiate.transactionId, 'Y');
              }
            } catch (e) {
              // Cross-origin - expected, will be handled by message handler or timeout
            }
          }, 500);

          // Add a manual continue button for when the redirect is blocked
          // Some browsers may block certain cross-origin redirects during 3DS flows
          // This button appears after 2 seconds to let user proceed manually
          let continueButtonTimeout: NodeJS.Timeout;
          let continueButton: HTMLButtonElement | null = null;
          
          const createContinueButton = () => {
            if (continueButton || !document.body.contains(container)) return;
            
            continueButton = document.createElement('button');
            continueButton.textContent = 'Continue Payment →';
            continueButton.style.cssText = `
              position: fixed;
              bottom: 30px;
              left: 50%;
              transform: translateX(-50%);
              padding: 14px 32px;
              background-color: #4F46E5;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              z-index: 10000;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
              transition: background-color 0.2s;
            `;
            continueButton.onmouseover = () => {
              if (continueButton) continueButton.style.backgroundColor = '#4338CA';
            };
            continueButton.onmouseout = () => {
              if (continueButton) continueButton.style.backgroundColor = '#4F46E5';
            };
            continueButton.onclick = () => {
              clearInterval(checkInterval);
              window.removeEventListener('message', messageHandler);
              if (continueButtonTimeout) clearTimeout(continueButtonTimeout);
              if (document.body.contains(container)) {
                document.body.removeChild(container);
              }
              if (continueButton && document.body.contains(continueButton)) {
                document.body.removeChild(continueButton);
              }
              setChallengeHtml(null);
              // After challenge completion, authentication status is typically 'Y' (successful)
              handleFinalizePayment(initiate.orderId, initiate.transactionId, 'Y');
            };
            document.body.appendChild(continueButton);
            console.log('[Payment] Continue button added - click after completing the challenge');
          };
          
          continueButtonTimeout = setTimeout(createContinueButton, 2000);
          
          // Cleanup after 5 minutes
          setTimeout(() => {
            if (document.body.contains(container)) {
              clearInterval(checkInterval);
              window.removeEventListener('message', messageHandler);
              if (continueButtonTimeout) clearTimeout(continueButtonTimeout);
              if (continueButton && document.body.contains(continueButton)) {
                document.body.removeChild(continueButton);
              }
              document.body.removeChild(container);
              setChallengeHtml(null);
              setPaymentProcessing(false);
              Alert.alert('Timeout', '3DS authentication timed out. Please try again.');
            }
          }, 300000);
        }
        return;
      }

      // Check gateway recommendation - it might be undefined, PROCEED, or other values
      console.log('[Payment] Checking gateway recommendation:', authenticate.gatewayRecommendation);
      console.log('[Payment] Authentication result:', authenticate.result);
      console.log('[Payment] Authentication status:', authenticate.authenticationStatus);

      // If there's no redirectHtml, check if we should proceed
      // Some gateways return SUCCESS/YES in result or authenticationStatus instead of PROCEED in gatewayRecommendation
      const shouldProceed = 
        authenticate.gatewayRecommendation === 'PROCEED' ||
        authenticate.result === 'SUCCESS' ||
        authenticate.authenticationStatus === 'Y' ||
        authenticate.authenticationStatus === 'AUTHENTICATION_SUCCESSFUL';

      if (!shouldProceed) {
        // Handle failure case - show error regardless of whether gatewayRecommendation exists
        const errorMsg = `Gateway recommendation: ${authenticate.gatewayRecommendation || 'UNKNOWN'}. Result: ${authenticate.result || 'UNKNOWN'}. Status: ${authenticate.authenticationStatus || 'UNKNOWN'}`;
        console.error('[Payment] Gateway did not recommend proceeding:', errorMsg);
        console.error('[Payment] Full response that failed:', authenticate);
        setPaymentProcessing(false);
        setStatusMessage('');
        Alert.alert(
          'Payment Authentication Failed', 
          `Authentication was not successful. ${errorMsg}`,
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('[Payment] Step 3: Finalizing payment...');
      setStatusMessage('Finalizing payment...');
      // Map authenticationStatus to the format expected by gateway (Y, N, U, I, A)
      // If authenticationStatus is 'AUTHENTICATION_SUCCESSFUL', use 'Y'
      // If it's undefined/null and gatewayRecommendation is PROCEED, default to 'Y'
      let authStatus = authenticate.authenticationStatus;
      if (authStatus === 'AUTHENTICATION_SUCCESSFUL' || authStatus === 'SUCCESS') {
        authStatus = 'Y';
      } else if (!authStatus && authenticate.gatewayRecommendation === 'PROCEED') {
        authStatus = 'Y'; // Default to success if gateway recommends proceeding
      }
      await handleFinalizePayment(initiate.orderId, initiate.transactionId, authStatus);
    } catch (error: any) {
      console.error('[Payment] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        data: error?.data,
        cause: error?.cause,
        name: error?.name,
        toString: error?.toString(),
      });
      
      // Log to console for debugging
      console.error('[Payment] Full error object:', error);
      
      // Extract user-friendly error message
      let errorMessage = 'There was an error processing your payment.';
      
      if (error?.message) {
        errorMessage = error.message;
        // Remove technical details for user-facing messages
        if (errorMessage.includes('[Mastercard]')) {
          errorMessage = errorMessage.replace(/\[Mastercard\]\s*/g, '');
        }
        if (errorMessage.includes('Missing configuration')) {
          errorMessage = 'Payment gateway is not configured. Please contact support.';
        }
        if (errorMessage.includes('Failed to connect') || errorMessage.includes('Network')) {
          errorMessage = 'Unable to connect to payment server. Please check your internet connection and try again.';
        }
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Alert.alert(
        'Payment Failed',
        errorMessage,
        [{ text: 'OK', onPress: () => {
          setChallengeHtml(null);
          setMethodHtml(null);
          setPaymentProcessing(false);
          setStatusMessage('');
        }}]
      );
      setChallengeHtml(null);
      setMethodHtml(null);
      setPaymentProcessing(false);
      setStatusMessage('');
    }
  };

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
        setCouponError(data?.error || 'Invalid coupon code');
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

  const getTierName = () => {
    const tierNames: Record<string, string> = {
      silver: 'Silver Package',
      gold: 'Gold Package',
      diamond: 'Diamond Package',
      elite: 'Elite Package',
    };
    return tierNames[tier] || tier;
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F9FAFB' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
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
          </View>

          {!appliedCoupon?.isFree && (
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
            </>
          )}

          <TouchableOpacity
            style={[
              styles.payButton,
              ((!appliedCoupon?.isFree && !isCardValid()) || paymentProcessing) && styles.payButtonDisabled,
            ]}
            onPress={() => {
              console.log('[Payment] TouchableOpacity onPress triggered');
              console.log('[Payment] Button state:', {
                isCardValid: isCardValid(),
                paymentProcessing,
                hasFreeCoupon: appliedCoupon?.isFree,
                disabled: (!appliedCoupon?.isFree && !isCardValid()) || paymentProcessing,
              });
              if ((!appliedCoupon?.isFree && !isCardValid()) || paymentProcessing) {
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
            disabled={(!appliedCoupon?.isFree && !isCardValid()) || paymentProcessing}
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
                  {appliedCoupon?.isFree
                    ? 'Activate Free Subscription'
                    : `Pay ${getFinalPrice().toFixed(2)} JOD`}
                </Text>
              </>
            )}
          </TouchableOpacity>

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
                if (event.nativeEvent.data === '3DS_AUTH_COMPLETE' && orderId && authTransactionId) {
                  setChallengeHtml(null);
                  // After challenge completion, authentication status is typically 'Y' (successful)
                  handleFinalizePayment(orderId, authTransactionId, 'Y');
                }
              }}
              onNavigationStateChange={(navState) => {
                if (navState.url.startsWith(redirectUrl) && orderId && authTransactionId) {
                  setChallengeHtml(null);
                  // After challenge completion, authentication status is typically 'Y' (successful)
                  handleFinalizePayment(orderId, authTransactionId, 'Y');
                }
              }}
            />
            {showNativeContinueButton && orderId && authTransactionId && (
              <TouchableOpacity
                style={styles.nativeContinueButton}
                onPress={() => {
                  console.log('[Payment] Native continue button pressed after 3DS challenge');
                  setChallengeHtml(null);
                  setShowNativeContinueButton(false);
                  // Assume successful authentication when user confirms manually
                  handleFinalizePayment(orderId, authTransactionId, 'Y');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.nativeContinueButtonText}>I’ve completed verification</Text>
              </TouchableOpacity>
            )}
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
  nativeContinueButton: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  nativeContinueButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
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
});
