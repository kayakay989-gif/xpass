import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';

export default publicProcedure
  .input(
    z.object({
      code: z.string(),
      originalPrice: z.number(),
    })
  )
  .query(async ({ input }) => {
    const upperCode = input.code.toUpperCase().trim();
    const coupon = await firestoreCoupons.getByCode(upperCode);

    if (!coupon) {
      return {
        valid: false,
        error: 'Invalid coupon code',
      };
    }

    if (!coupon.isActive) {
      return {
        valid: false,
        error: 'This coupon is not active',
      };
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return {
        valid: false,
        error: 'This coupon has expired',
      };
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        error: 'This coupon has reached its usage limit',
      };
    }

    // Calculate discount
    const discountAmount = (input.originalPrice * coupon.discountPercent) / 100;
    const finalPrice = Math.max(0, input.originalPrice - discountAmount);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountPercent: coupon.discountPercent,
      },
      discountAmount,
      finalPrice,
      isFree: finalPrice === 0,
    };
  });
