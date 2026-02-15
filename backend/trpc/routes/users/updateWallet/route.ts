import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { db } from '@/backend/lib/db';

export default protectedProcedure
  .input(z.object({ 
    userId: z.string(),
    amount: z.number(),
  }))
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    await db.init();
    
    const user = await db.users.getById(input.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await db.users.update(input.userId, {
      walletBalance: user.walletBalance + input.amount,
    });

    if (!updatedUser) {
      throw new Error('Failed to update wallet');
    }

    return updatedUser;
  });
