import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { payWithAuthentication, computeAmount } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { firestorePayments, firestoreSubscriptions, firestoreCoupons } from '@/backend/lib/firestore-admin';

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
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
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

    // If 100% discount, skip payment gateway
    const isFree = finalAmount === 0;

    if (isFree) {
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
        totalPrice: 0, // Free subscription
        visitsUsed: 0,
        maxVisitsPerMonth: 30,
        isActive: true,
      };

      await firestoreSubscriptions.create(subscription);

      // Create payment record for tracking
      await firestorePayments.create({
        id: `${input.orderId}-coupon`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        amount: 0,
        originalAmount,
        discountAmount,
        currency,
        orderId: input.orderId,
        transactionId: 'coupon',
        status: 'succeeded',
        paymentMethod: 'coupon',
        couponCode: input.couponCode?.toUpperCase().trim() || null,
        completedAt: new Date(),
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
        paymentTransactionId: 'coupon',
        isFree: true,
      };
    }

    // Partial discount or no coupon - proceed with payment
    if (!input.cardNumber || !input.expiryMonth || !input.expiryYear || !input.authenticationTransactionId) {
      throw new Error('Card details and authentication are required for payment');
    }

    const amount = finalAmount;

    // For PAY operation, use transaction ID "2" (or increment from auth transaction)
    // The authentication used transaction "1", so payment uses "2"
    const parsedAuthTxn = Number.parseInt(input.authenticationTransactionId, 10);
    const paymentTransactionId =
      Number.isFinite(parsedAuthTxn) && parsedAuthTxn > 0 ? String(parsedAuthTxn + 1) : '2';

    await firestorePayments.create({
      id: `${input.orderId}-${paymentTransactionId}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount,
      originalAmount: originalAmount,
      discountAmount,
      currency,
      orderId: input.orderId,
      transactionId: paymentTransactionId,
      status: 'PROCESSING_PAYMENT',
      couponCode: input.couponCode?.toUpperCase().trim() || null,
    });

    console.log('[PayWith3DS] Calling payWithAuthentication with:', {
      orderId: input.orderId,
      paymentTransactionId,
      authenticationTransactionId: input.authenticationTransactionId,
      authenticationStatus: input.authenticationStatus,
    });

    const gatewayResponse = await payWithAuthentication({
      orderId: input.orderId,
      paymentTransactionId,
      authenticationTransactionId: input.authenticationTransactionId,
      authenticationStatus: input.authenticationStatus, // Pass through the 3DS authentication status (Y, N, U, I, A)
      amount,
      currency,
      reference: input.orderId,
      card: {
        number: input.cardNumber,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
      },
    });

    if (gatewayResponse.result !== 'SUCCESS') {
      throw new Error(
        `[Payment] Gateway returned non-success result: ${gatewayResponse.result}. Recommendation: ${gatewayResponse.response?.gatewayRecommendation}`
      );
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
      totalPrice: amount, // Final amount after discount
      visitsUsed: 0,
      maxVisitsPerMonth: 30,
      isActive: true,
    };

    await firestoreSubscriptions.create(subscription);

    await firestorePayments.update(`${input.orderId}-${paymentTransactionId}`, {
      status: 'succeeded',
      completedAt: new Date(),
      gatewayResponse,
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

