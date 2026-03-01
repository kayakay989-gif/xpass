import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';

export default adminProcedure
  .input(
    z.object({
      couponId: z.string(),
      code: z.string().min(1).max(50).optional(),
      discountPercent: z.number().min(1).max(100).optional(),
      isActive: z.boolean().optional(),
      usageLimit: z.number().nullable().optional(),
      expiresAt: z.date().nullable().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const { couponId, ...updates } = input;
    
    const existing = await firestoreCoupons.getById(couponId);
    if (!existing) {
      throw new Error('Coupon not found');
    }

    // If code is being updated, check for duplicates
    if (updates.code) {
      const upperCode = updates.code.toUpperCase().trim();
      const duplicate = await firestoreCoupons.getByCode(upperCode);
      if (duplicate && duplicate.id !== couponId) {
        throw new Error('Coupon code already exists');
      }
      updates.code = upperCode;
    }

    await firestoreCoupons.update(couponId, updates);
    return { success: true };
  });
