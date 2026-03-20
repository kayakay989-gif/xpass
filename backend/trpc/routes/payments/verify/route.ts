import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { firestorePayments, firestoreSubscriptions } from '@/backend/lib/firestore-admin';

/**
 * Payment verification endpoint intended for post-3DS flows.
 * Returns `confirmed: true` only when the payment record is marked `succeeded`.
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      orderId: z.string(),
      paymentTransactionId: z.string().optional(), // Defaults to "2" for MPGS PAY after auth.
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const paymentTransactionId = input.paymentTransactionId || '2';
    const paymentId = `${input.orderId}-${paymentTransactionId}`;

    const payment = await firestorePayments.getById(paymentId);
    if (!payment) {
      return {
        confirmed: false,
        status: 'NOT_FOUND',
        paymentId,
      };
    }

    const status = String(payment.status || '').toUpperCase();
    const confirmed = status === 'SUCCEEDED';

    // Optional: if payment succeeded but subscription is missing/inactive, mark as not confirmed.
    if (confirmed) {
      const subscriptionId = payment.subscriptionId ? String(payment.subscriptionId) : null;
      if (subscriptionId) {
        const sub = await firestoreSubscriptions.getById(subscriptionId);
        if (!sub || !sub.isActive) {
          return {
            confirmed: false,
            status,
            paymentId,
          };
        }
      }
    }

    return {
      confirmed,
      status,
      paymentId,
      subscriptionId: payment.subscriptionId ? String(payment.subscriptionId) : null,
    };
  });

