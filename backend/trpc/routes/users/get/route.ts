import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { db } from '@/backend/lib/db';

export default protectedProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    await db.init();
    const user = await db.users.getById(input.userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  });
