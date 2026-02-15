import { publicProcedure } from '@/backend/trpc/create-context';
import { z } from 'zod';
import { db } from '@/backend/lib/db';

export const googleLoginProcedure = publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      name: z.string(),
      googleId: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    const { email, name, googleId } = input;
    console.log('[tRPC] Google login:', { email, name });

    let user = await db.users.getByEmail(email);

    if (!user) {
      console.log('[tRPC] Creating new user from Google login');
      user = await db.users.create({
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name,
        email,
        phone: '',
        googleId,
        referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        walletBalance: 0,
        createdAt: new Date(),
      });
    }

    console.log('[tRPC] Google login successful:', user.id);

    return {
      success: true,
      user,
      token: `token-${user.id}`,
    };
  });
