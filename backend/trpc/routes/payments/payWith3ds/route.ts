import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { payWithAuthentication, computeAmount } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { firestorePayments, firestoreSubscriptions } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      orderId: z.string(),
      authenticationTransactionId: z.string(),
      authenticationStatus: z.string().optional(), // 3DS authentication status (Y, N, U, I, A)
      cardNumber: z.string(),
      expiryMonth: z.string(),
      expiryYear: z.string(),
      currency: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    const currency = input.currency || 'JOD';

    const { amount, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
      currency,
    });

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
      currency,
      orderId: input.orderId,
      transactionId: paymentTransactionId,
      status: 'PROCESSING_PAYMENT',
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
      totalPrice: amount,
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

    return {
      success: true,
      subscription,
      gatewayResponse,
      orderId: input.orderId,
      paymentTransactionId,
    };
  });

