import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreCheckIns } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    const checkIns = await firestoreCheckIns.getByUserId(input.userId);
    return checkIns;
  });
