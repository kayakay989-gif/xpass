import { z } from 'zod';
import { gymOwnerOrAdminProcedure } from '@/backend/trpc/create-context';
import { firestoreCheckIns, firestoreUsers, firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import { CheckIn } from '@/types';

type CheckInWithDetails = CheckIn & {
  userName: string;
  userEmail?: string;
  tier: 'silver' | 'gold' | 'diamond' | 'elite';
};

export default gymOwnerOrAdminProcedure
  .input(z.object({ 
    gymId: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }))
  .query(async ({ input, ctx }) => {
    // Gym owners can only see their own gym’s check-ins
    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== input.gymId) {
      throw new Error('Unauthorized');
    }
    
    const allCheckIns = await firestoreCheckIns.getByGymId(input.gymId);
    
    let filteredCheckIns = allCheckIns;
    
    if (input.startDate || input.endDate) {
      filteredCheckIns = allCheckIns.filter((ci: CheckIn) => {
        const ciDate = new Date(ci.timestamp);
        const start = input.startDate ? new Date(input.startDate) : null;
        const end = input.endDate ? new Date(input.endDate) : null;
        
        if (start && ciDate < start) return false;
        if (end && ciDate > end) return false;
        
        return true;
      });
    }
    
    const checkInsWithDetails: CheckInWithDetails[] = await Promise.all(
      filteredCheckIns.map(async (ci: CheckIn) => {
        const user = await firestoreUsers.getById(ci.userId);
        const subscription = await firestoreSubscriptions.getByUserId(ci.userId);
        
        return {
          ...ci,
          userName: user?.name || 'Unknown',
          userEmail: user?.email,
          tier: subscription?.tier || 'silver',
        } as CheckInWithDetails;
      })
    );
    
    return checkInsWithDetails;
  });
