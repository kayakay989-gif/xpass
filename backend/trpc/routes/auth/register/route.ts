import { publicProcedure } from '@/backend/trpc/create-context';
import { z } from 'zod';
import { db } from '@/backend/lib/db';
import { TRPCError } from '@trpc/server';

export const registerProcedure = publicProcedure
  .input(
    z.object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      email: z.string().email('Invalid email address'),
      phone: z.string().regex(/^\+962[0-9]{9}$/, 'Invalid Jordan phone number'),
      password: z.string().min(6, 'Password must be at least 6 characters'),
    })
  )
  .mutation(async ({ input }) => {
    const { name, email, phone, password } = input;
    console.log('[tRPC] Register user:', { name, email, phone });

    const existingUserByEmail = await db.users.getByEmail(email);
    if (existingUserByEmail) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Email already registered',
      });
    }

    const existingUserByPhone = await db.users.getByPhone(phone);
    if (existingUserByPhone) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Phone number already registered',
      });
    }

    const user = await db.users.create({
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      email,
      phone,
      password,
      referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      walletBalance: 0,
      createdAt: new Date(),
    });

    console.log('[tRPC] User registered successfully:', user.id);

    return {
      success: true,
      user,
      token: `token-${user.id}`,
    };
  });
