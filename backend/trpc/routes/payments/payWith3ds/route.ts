import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { payWithAuthentication, computeAmount } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { firestorePayments, firestoreSubscriptions, firestoreCoupons, firestoreUsers, firestoreWalletTransactions } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      orderId: z.string(),
      authenticationTransactionId: z.string().optional(), // Optional for 100% coupon
      authenticationStatus: z.string().optional(), // 3DS authentication status (Y, N, U, I, A)
      cardNumber: z.string().optional(), // Optional for 100% coupon
      expiryMonth: z.string().optional(), // Optional for 100% coupon
      expiryYear: z.string().optional(), // Optional for 100% coupon
      currency: z.string().optional(),
      couponCode: z.string().optional(),
      useWallet: z.boolean().optional().default(false),
      paymentMethod: z.enum(['card', 'wallet']).optional().default('card'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }

    // Check if user already has an active subscription
    const existingSubscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (existingSubscription) {
      const endDate = existingSubscription.endDate ? new Date(existingSubscription.endDate) : null;
      const now = new Date();
      // Check if subscription is still active (isActive AND endDate > now)
      if (existingSubscription.isActive && endDate && endDate.getTime() > now.getTime()) {
        throw new Error('You already have an active subscription');
      }
    }

    const currency = input.currency || 'JOD';

    const { amount: originalAmount, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
      currency,
    });

    // Validate coupon if provided
    let finalAmount = originalAmount;
    let couponId: string | null = null;
    let discountAmount = 0;

    if (input.couponCode) {
      const upperCode = input.couponCode.toUpperCase().trim();
      const coupon = await firestoreCoupons.getByCode(upperCode);

      if (!coupon) {
        throw new Error('Invalid coupon code');
      }

      if (!coupon.isActive) {
        throw new Error('This coupon is not active');
      }

      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new Error('This coupon has expired');
      }

      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw new Error('This coupon has reached its usage limit');
      }

      discountAmount = (originalAmount * coupon.discountPercent) / 100;
      finalAmount = Math.max(0, originalAmount - discountAmount);
      couponId = coupon.id;
    }

    // Get user wallet balance if wallet is being used
    let walletBalance = 0;
    let walletUsed = 0;
    let cardAmount = finalAmount;
    
    if (input.useWallet) {
      const user = await firestoreUsers.getById(input.userId);
      if (!user) {
        throw new Error('User not found');
      }
      walletBalance = user.walletBalance || 0;
      
      // Calculate wallet usage
      walletUsed = Math.min(walletBalance, finalAmount);
      cardAmount = Math.max(0, finalAmount - walletUsed);
      
      // Validate wallet balance
      if (walletUsed > walletBalance) {
        throw new Error('Insufficient wallet balance');
      }
      if (walletUsed > finalAmount) {
        throw new Error('Wallet amount cannot exceed package price');
      }
      if (walletUsed < 0) {
        throw new Error('Wallet amount cannot be negative');
      }
    }

    // If 100% discount or wallet covers full amount, skip payment gateway
    const isFree = finalAmount === 0;
    const isFullWalletPayment = walletUsed >= finalAmount && cardAmount === 0;

    if (isFree || isFullWalletPayment) {
      // No payment required - create subscription directly
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + input.duration);

      const subscription: Subscription = {
        id: `sub-${Date.now()}`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        startDate,
        endDate,
        monthlyPrice,
        totalPrice: isFree ? 0 : finalAmount, // Free subscription or wallet payment
        visitsUsed: 0,
        maxVisitsPerMonth: 30,
        isActive: true,
      };

      // Create subscription first
      await firestoreSubscriptions.create(subscription);

      // Deduct wallet balance if wallet was used
      if (walletUsed > 0) {
        const newWalletBalance = walletBalance - walletUsed;
        await firestoreUsers.update(input.userId, {
          walletBalance: newWalletBalance,
        });

        // Create wallet transaction record
        await firestoreWalletTransactions.create({
          userId: input.userId,
          type: 'subscription_payment',
          amount: -walletUsed, // Negative for debit
          description: `Subscription payment for ${input.tier} package (${input.duration} month${input.duration > 1 ? 's' : ''})`,
          subscriptionId: subscription.id,
          createdAt: new Date(),
        });
      }

      // Create payment record for tracking
      await firestorePayments.create({
        id: `${input.orderId}-${isFree ? 'coupon' : 'wallet'}`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        amount: isFree ? 0 : finalAmount,
        originalAmount,
        discountAmount,
        currency,
        orderId: input.orderId,
        transactionId: isFree ? 'coupon' : 'wallet',
        status: 'succeeded',
        paymentMethod: isFree ? 'coupon' : input.paymentMethod || 'wallet',
        couponCode: input.couponCode?.toUpperCase().trim() || null,
        completedAt: new Date(),
        walletUsed: walletUsed,
        cardAmount: 0,
        externalPaymentAmount: 0,
        totalAmount: finalAmount,
      });

      // Increment coupon usage
      if (couponId) {
        await firestoreCoupons.incrementUsage(couponId);
      }

      return {
        success: true,
        subscription,
        gatewayResponse: null,
        orderId: input.orderId,
        paymentTransactionId: isFree ? 'coupon' : 'wallet',
        isFree: isFree,
      };
    }

    // Partial discount or no coupon - proceed with payment
    // If wallet is used but doesn't cover full amount, card payment is required
    if (cardAmount > 0) {
      if (!input.cardNumber || !input.expiryMonth || !input.expiryYear || !input.authenticationTransactionId) {
        throw new Error('Card details and authentication are required for payment');
      }
    }

    const amount = cardAmount; // Charge only the card amount, wallet covers the rest

    // For PAY operation, use transaction ID "2" (or increment from auth transaction)
    // The authentication used transaction "1", so payment uses "2"
    const parsedAuthTxn = input.authenticationTransactionId 
      ? Number.parseInt(input.authenticationTransactionId, 10)
      : NaN;
    const paymentTransactionId =
      Number.isFinite(parsedAuthTxn) && parsedAuthTxn > 0 ? String(parsedAuthTxn + 1) : '2';

    // Deduct wallet balance first (before card payment) if wallet is being used
    let walletDeducted = false;
    if (walletUsed > 0) {
      const newWalletBalance = walletBalance - walletUsed;
      await firestoreUsers.update(input.userId, {
        walletBalance: newWalletBalance,
      });
      walletDeducted = true;
    }

    await firestorePayments.create({
      id: `${input.orderId}-${paymentTransactionId}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount: cardAmount, // Card amount only
      originalAmount: originalAmount,
      discountAmount,
      currency,
      orderId: input.orderId,
      transactionId: paymentTransactionId,
      status: 'PROCESSING_PAYMENT',
      couponCode: input.couponCode?.toUpperCase().trim() || null,
      walletUsed: walletUsed,
      cardAmount: cardAmount,
      externalPaymentAmount: cardAmount,
      totalAmount: finalAmount,
      paymentMethod: input.paymentMethod || 'card',
    });

    let gatewayResponse = null;
    
    // Only call payment gateway if card amount > 0
    if (cardAmount > 0) {
      console.log('[PayWith3DS] Calling payWithAuthentication with:', {
        orderId: input.orderId,
        paymentTransactionId,
        authenticationTransactionId: input.authenticationTransactionId,
        authenticationStatus: input.authenticationStatus,
        amount: cardAmount,
        walletUsed: walletUsed,
      });

      gatewayResponse = await payWithAuthentication({
        orderId: input.orderId,
        paymentTransactionId,
        authenticationTransactionId: input.authenticationTransactionId!,
        authenticationStatus: input.authenticationStatus, // Pass through the 3DS authentication status (Y, N, U, I, A)
        amount: cardAmount,
        currency,
        reference: input.orderId,
        card: {
          number: input.cardNumber!,
          expiryMonth: input.expiryMonth!,
          expiryYear: input.expiryYear!,
        },
      });

      if (gatewayResponse.result !== 'SUCCESS') {
        // Rollback wallet deduction if card payment fails
        if (walletDeducted && walletUsed > 0) {
          await firestoreUsers.update(input.userId, {
            walletBalance: walletBalance, // Restore original balance
          });
        }
        throw new Error(
          `[Payment] Gateway returned non-success result: ${gatewayResponse.result}. Recommendation: ${gatewayResponse.response?.gatewayRecommendation}`
        );
      }
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + input.duration);

    const subscription: Subscription = {
      id: `sub-${Date.now()}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      startDate,
      endDate,
      monthlyPrice,
      totalPrice: finalAmount, // Total amount (wallet + card)
      visitsUsed: 0,
      maxVisitsPerMonth: 30,
      isActive: true,
    };

    await firestoreSubscriptions.create(subscription);

    // Create wallet transaction record if wallet was used
    if (walletUsed > 0) {
      await firestoreWalletTransactions.create({
        userId: input.userId,
        type: 'subscription_payment',
        amount: -walletUsed, // Negative for debit
        description: `Subscription payment for ${input.tier} package (${input.duration} month${input.duration > 1 ? 's' : ''})`,
        subscriptionId: subscription.id,
        createdAt: new Date(),
      });
    }

    await firestorePayments.update(`${input.orderId}-${paymentTransactionId}`, {
      status: 'succeeded',
      completedAt: new Date(),
      gatewayResponse: gatewayResponse,
      paymentMethod: input.paymentMethod || 'card',
      externalPaymentAmount: cardAmount,
      walletUsed: walletUsed,
      totalAmount: finalAmount,
    });

    // Increment coupon usage if coupon was used
    if (couponId) {
      await firestoreCoupons.incrementUsage(couponId);
    }

    return {
      success: true,
      subscription,
      gatewayResponse,
      orderId: input.orderId,
      paymentTransactionId,
      isFree: false,
    };
  });

