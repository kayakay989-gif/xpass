import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';

export default adminProcedure
  .input(
    z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional()
  )
  .query(async ({ input }) => {
    const limit = input?.limit || 20;
    const offset = input?.offset || 0;
    const result = await firestoreCoupons.getAllPaginated(limit, offset);
    return result;
  });
