import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(z.object({
    userId: z.string(),
    subscriptionId: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }

    console.log('[CancelSubscription] Cancelling subscription:', { userId: input.userId, subscriptionId: input.subscriptionId });

    // Get the subscription to verify ownership
    const subscription = await firestoreSubscriptions.getById(input.subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.userId !== input.userId) {
      throw new Error('Unauthorized: Subscription does not belong to user');
    }

    // Cancel the subscription by setting isActive to false
    await firestoreSubscriptions.update(input.subscriptionId, {
      isActive: false,
    });

    console.log('[CancelSubscription] Subscription cancelled successfully');

    return { success: true };
  });
