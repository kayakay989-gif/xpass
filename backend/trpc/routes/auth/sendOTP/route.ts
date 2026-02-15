import { publicProcedure } from '@/backend/trpc/create-context';
import { z } from 'zod';
import { db } from '@/backend/lib/db';

export const sendOTPProcedure = publicProcedure
  .input(
    z.object({
      phoneNumber: z.string(),
      method: z.enum(['sms', 'email']),
      email: z.string().email().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const { phoneNumber, method, email } = input;
    console.log('[tRPC] Sending OTP:', { phoneNumber, method, email });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.otps.store(phoneNumber, otp, expiresAt);

    if (method === 'sms') {
      console.log(`[OTP] SMS OTP for ${phoneNumber}: ${otp}`);
    } else if (method === 'email' && email) {
      console.log(`[OTP] Email OTP for ${email}: ${otp}`);
    }

    return {
      success: true,
      message: 'OTP sent successfully',
      devOtp: otp,
    };
  });
