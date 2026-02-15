import { publicProcedure } from '@/backend/trpc/create-context';
import { z } from 'zod';
import { db } from '@/backend/lib/db';

export const verifyOTPProcedure = publicProcedure
  .input(
    z.object({
      phoneNumber: z.string(),
      otp: z.string(),
      name: z.string().optional(),
      email: z.string().email().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const { phoneNumber, otp, name, email } = input;
    console.log('[tRPC] Verifying OTP:', { phoneNumber, otp });

    const isValid = await db.otps.verify(phoneNumber, otp);

    if (!isValid) {
      throw new Error('Invalid or expired OTP');
    }

    let user = await db.users.getByPhone(phoneNumber);

    if (!user) {
      console.log('[tRPC] Creating new user');
      user = await db.users.create({
        id: `user-${Date.now()}`,
        name: name || 'User',
        email: email || '',
        phone: phoneNumber,
        referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        walletBalance: 0,
        createdAt: new Date(),
      });
    }

    await db.otps.delete(phoneNumber);

    return {
      success: true,
      user,
      token: `token-${user.id}`,
    };
  });
