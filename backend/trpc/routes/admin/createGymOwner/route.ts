import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { adminProcedure } from '../../../create-context';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { hashPassword } from '@/backend/lib/password';
import {
  buildGymOwnerDefaultPassword,
  buildGymOwnerUsername,
  normalizeGymOwnerUsername,
} from '@/lib/gym-owner-username';

function buildOwnerCredentials(gymId: string, gymName: string) {
  const username = buildGymOwnerUsername(gymId, gymName);
  const password = buildGymOwnerDefaultPassword(gymId);
  return { username, password };
}

export default adminProcedure
  .input(
    z.object({
      gymId: z.string(),
      gymName: z.string().optional(),
      email: z.string().optional(),
      ownerName: z.string().optional(),
      recreate: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const gym = await firestoreGyms.getById(input.gymId);
    if (!gym) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Gym not found' });
    }

    const gymName = input.gymName?.trim() || gym.name || 'gym';
    const gymExtras = gym as typeof gym & { ownerEmail?: string; ownerName?: string };
    const { username, password } = buildOwnerCredentials(input.gymId, gymName);

    const existing = await firestoreGymOwners.getByGymId(input.gymId);
    if (existing && !input.recreate) {
      return {
        ownerId: existing.id,
        username: existing.username,
        password: null,
        created: false,
      };
    }

    if (existing) {
      await firestoreGymOwners.delete(existing.id);
    }

    const ownerId = randomUUID();
    await firestoreGymOwners.create({
      id: ownerId,
      gymId: input.gymId,
      username,
      usernameNormalized: normalizeGymOwnerUsername(username),
      passwordHash: hashPassword(password),
      email: input.email || gymExtras.ownerEmail || undefined,
      name: input.ownerName || gymExtras.ownerName || `${gymName} Owner`,
      createdAt: new Date(),
    });

    return {
      ownerId,
      username,
      password,
      created: true,
    };
  });
