import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import { hasRemainingPasses } from '@/lib/subscription-active';

export default protectedProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    const start = Date.now();
    let subscription = await firestoreSubscriptions.getMemberViewSubscription(input.userId);

    // Self-heal legacy rows stuck at 0 passes with isActive still true.
    if (subscription?.isActive && !hasRemainingPasses(subscription)) {
      await firestoreSubscriptions.update(subscription.id, {
        isActive: false,
        status: 'passes_exhausted',
      });
      subscription = {
        ...subscription,
        isActive: false,
        status: 'passes_exhausted',
      };
    }

    console.log(
      '[Perf] subscriptions.getCurrent:',
      JSON.stringify({ ms: Date.now() - start, found: !!subscription })
    );
    return subscription;
  });
