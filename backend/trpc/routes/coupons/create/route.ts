import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';
import { randomUUID } from 'crypto';

export default adminProcedure
  .input(
    z.object({
      code: z.string().min(1).max(50),
      discountPercent: z.number().min(1).max(100),
      isActive: z.boolean().default(true),
      usageLimit: z.number().nullable().optional(),
      expiresAt: z.date().nullable().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const upperCode = input.code.toUpperCase().trim();
    
    // Check for duplicate code
    const existing = await firestoreCoupons.getByCode(upperCode);
    if (existing) {
      throw new Error('Coupon code already exists');
    }

    const coupon = {
      id: randomUUID(),
      code: upperCode,
      discountPercent: input.discountPercent,
      isActive: input.isActive,
      createdAt: new Date(),
      usageLimit: input.usageLimit ?? null,
      usedCount: 0,
      expiresAt: input.expiresAt ?? null,
    };

    await firestoreCoupons.create(coupon);
    return coupon;
  });
