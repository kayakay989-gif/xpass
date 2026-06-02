import { TRPCError } from '@trpc/server';
import { publicProcedure } from '../../../create-context';
import { z } from 'zod';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { createGymOwnerSession } from '@/backend/lib/gym-owner-auth';
import { hashPassword, verifyPassword } from '@/backend/lib/password';
import admin from '@/backend/lib/firebase-admin';

export default publicProcedure
  .input(z.object({
    username: z.string(),
    password: z.string(),
  }))
  .mutation(async ({ input }) => {
    const username = input.username.trim();
    const password = input.password.trim();

    if (!username || !password) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Please enter both username and password',
      });
    }

    const gymOwner = await firestoreGymOwners.getByUsername(username);

    if (!gymOwner) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    const hasHash = typeof gymOwner.passwordHash === 'string' && gymOwner.passwordHash.length > 0;
    const legacyPlain = typeof gymOwner.password === 'string' ? gymOwner.password.trim() : '';

    const ok = hasHash
      ? verifyPassword(password, gymOwner.passwordHash!)
      : legacyPlain === password;

    if (!ok) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    // Upgrade legacy/weak hashes to pbkdf2 (best-effort)
    if (!hasHash || (gymOwner.passwordHash && !gymOwner.passwordHash.startsWith('pbkdf2:'))) {
      try {
        const passwordHash = hashPassword(password);
        await admin
          .firestore()
          .collection('gymOwners')
          .doc(gymOwner.id)
          .set({ passwordHash }, { merge: true });
      } catch {
        // non-fatal
      }
    }

    const gym = await firestoreGyms.getById(gymOwner.gymId);

    if (!gym) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Gym not found. Please contact administrator.',
      });
    }

    const session = await createGymOwnerSession({
      ownerId: gymOwner.id,
      gymId: gymOwner.gymId,
      ttlHours: 24 * 7,
    });

    return {
      success: true,
      gymId: gymOwner.gymId,
      gym: gym,
      owner: {
        id: gymOwner.id,
        username: gymOwner.username,
        name: gymOwner.name,
        email: gymOwner.email,
      },
      sessionToken: session.token,
    };
  });
