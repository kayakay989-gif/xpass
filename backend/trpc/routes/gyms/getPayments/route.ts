import { z } from 'zod';
import { gymOwnerOrAdminProcedure } from '@/backend/trpc/create-context';

export default gymOwnerOrAdminProcedure
  .input(z.object({ 
    gymId: z.string(),
  }))
  .query(async ({ input, ctx }) => {
    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== input.gymId) {
      throw new Error('Unauthorized');
    }
    // For now, return empty array as payments aren't tracked in Firestore yet
    // This can be enhanced later to track payments per gym
    // The gym dashboard will still show check-in stats correctly
    const payments: any[] = [];
    return payments;
  });
