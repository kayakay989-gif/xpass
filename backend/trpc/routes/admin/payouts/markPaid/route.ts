import { z } from 'zod';
import { adminProcedure } from '@/backend/trpc/create-context';
import { firestorePayouts } from '@/backend/lib/firestore-admin';

export default adminProcedure
  .input(
    z.object({
      payoutId: z.string(),
    }),
  )
  .mutation(async ({ input }) => {
    await firestorePayouts.markPaid(input.payoutId);
    return { success: true };
  });

