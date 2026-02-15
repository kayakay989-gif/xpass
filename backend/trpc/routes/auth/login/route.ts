import { publicProcedure } from '@/backend/trpc/create-context';
import { z } from 'zod';
import { db } from '@/backend/lib/db';
import { TRPCError } from '@trpc/server';

export const loginProcedure = publicProcedure
  .input(
    z.object({
      identifier: z.string(),
      password: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    const { identifier, password } = input;
    console.log('[tRPC] Login attempt:', { identifier });

    let user = null;

    if (identifier.includes('@')) {
      user = await db.users.getByEmail(identifier);
    } else {
      const formattedPhone = identifier.startsWith('+962') ? identifier : `+962${identifier}`;
      user = await db.users.getByPhone(formattedPhone);
    }

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.password !== password) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid password',
      });
    }

    console.log('[tRPC] Login successful:', user.id);

    return {
      success: true,
      user,
      token: `token-${user.id}`,
    };
  });
