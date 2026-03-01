import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';

export default adminProcedure
  .input(z.object({ couponId: z.string() }))
  .mutation(async ({ input }) => {
    const existing = await firestoreCoupons.getById(input.couponId);
    if (!existing) {
      throw new Error('Coupon not found');
    }

    await firestoreCoupons.delete(input.couponId);
    return { success: true };
  });
