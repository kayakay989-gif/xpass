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

    // XPASS subscriptions cannot be cancelled - they expire automatically
    throw new Error('Subscriptions cannot be cancelled. They expire automatically.');
  });
