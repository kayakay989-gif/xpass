import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreSubscriptions } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    const start = Date.now();
    const subscription = await firestoreSubscriptions.getMemberViewSubscription(input.userId);
    console.log(
      '[Perf] subscriptions.getCurrent:',
      JSON.stringify({ ms: Date.now() - start, found: !!subscription })
    );
    return subscription;
  });
