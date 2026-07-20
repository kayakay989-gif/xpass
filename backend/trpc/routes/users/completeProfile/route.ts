import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { firestoreUsers } from '@/backend/lib/firestore-admin';
import { User } from '@/types';
import {
  isValidMemberAge,
  isValidMemberEmail,
  isValidMemberName,
  MIN_MEMBER_AGE,
  normalizeMemberName,
} from '@/lib/profile-validation';

export default protectedProcedure
  .input(
    z.object({
      name: z.string().trim().min(2, 'Full name is required'),
      email: z.string().trim().email('A valid email is required'),
      age: z.number().int().min(MIN_MEMBER_AGE).max(150),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const uid = ctx.user?.uid;
    if (!uid) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
    }

    const name = normalizeMemberName(input.name);
    const email = input.email.trim().toLowerCase();
    const age = input.age;

    if (!isValidMemberName(name)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please enter your full name' });
    }
    if (!isValidMemberEmail(email)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please enter a valid email address' });
    }
    if (!isValidMemberAge(age)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Age must be at least ${MIN_MEMBER_AGE}`,
      });
    }

    const existing = await firestoreUsers.getById(uid);
    const resolvedName =
      existing?.name && isValidMemberName(existing.name)
        ? normalizeMemberName(existing.name)
        : name;

    await firestoreUsers.update(uid, {
      name: resolvedName,
      email,
      age,
      profileComplete: true,
    } as Partial<User>);

    return {
      ok: true as const,
      profile: {
        id: uid,
        name: resolvedName,
        email,
        age,
        profileComplete: true,
      },
    };
  });
