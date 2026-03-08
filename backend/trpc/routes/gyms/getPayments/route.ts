import { z } from 'zod';
import { gymOwnerOrAdminProcedure } from '@/backend/trpc/create-context';
import { firestorePayouts } from '@/backend/lib/firestore-admin';

export default gymOwnerOrAdminProcedure
  .input(z.object({ 
    gymId: z.string(),
  }))
  .query(async ({ input, ctx }) => {
    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== input.gymId) {
      throw new Error('Unauthorized');
    }
    
    // Get all payouts for this gym
    const allPayouts = await firestorePayouts.getAll();
    const gymPayouts = allPayouts.filter((p) => p.gymId === input.gymId);
    
    // Sort by month (newest first)
    return gymPayouts.sort((a, b) => {
      if (a.month > b.month) return -1;
      if (a.month < b.month) return 1;
      return 0;
    });
  });
