import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { gymOwnerOrAdminProcedure } from '@/backend/trpc/create-context';
import { firestoreCheckIns, firestoreUsers, firestoreSubscriptions } from '@/backend/lib/firestore-admin';
import { logCheckInSync } from '@/backend/lib/check-in-sync-log';
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
    const gymId = input.gymId.trim();

    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== gymId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
    }

    let allCheckIns: CheckIn[] = [];
    try {
      allCheckIns = await firestoreCheckIns.getByGymId(gymId);
    } catch (error: any) {
      logCheckInSync({
        event: 'gym_check_ins_query',
        gymId,
        reason: error?.message || 'getByGymId_failed',
        rawCount: 0,
        returnedCount: 0,
      });
      console.error('[CheckInSync] getByGymId failed:', { gymId, error });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load check-ins. Please refresh.',
      });
    }

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

    const checkInsWithDetails: CheckInWithDetails[] = [];
    for (const ci of filteredCheckIns) {
      try {
        const user = await firestoreUsers.getById(ci.userId);
        const subscription = await firestoreSubscriptions.getByUserId(ci.userId);

        checkInsWithDetails.push({
          ...ci,
          userName: user?.name || 'Unknown',
          userEmail: user?.email,
          tier: subscription?.tier || 'silver',
        } as CheckInWithDetails);
      } catch (error: any) {
        console.warn('[CheckInSync] Enrichment failed for check-in (keeping record):', {
          checkInId: ci.id,
          userId: ci.userId,
          error: error?.message,
        });
        checkInsWithDetails.push({
          ...ci,
          userName: 'Unknown',
          tier: 'silver',
        } as CheckInWithDetails);
      }
    }

    logCheckInSync({
      event: 'gym_check_ins_query',
      gymId,
      rawCount: allCheckIns.length,
      filteredCount: filteredCheckIns.length,
      returnedCount: checkInsWithDetails.length,
      lookupMethod: 'gymId_equality_in_memory_sort',
    });

    return checkInsWithDetails;
  });
