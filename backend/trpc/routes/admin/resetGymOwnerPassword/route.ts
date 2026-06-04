import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { applyCanonicalGymOwnerCredentials } from '@/backend/lib/gym-owner-credentials';
import { buildGymOwnerDefaultPassword, buildGymOwnerUsername } from '@/lib/gym-owner-username';
import { hashPassword } from '@/backend/lib/password';
import { randomUUID } from 'crypto';
import { normalizeGymOwnerUsername } from '@/lib/gym-owner-username';

export default adminProcedure
  .input(z.object({ gymId: z.string() }))
  .mutation(async ({ input }) => {
    const gymId = input.gymId.trim();
    const gym = await firestoreGyms.getById(gymId);
    if (!gym) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Gym not found' });
    }

    let owner = await firestoreGymOwners.getByGymId(gymId);
    if (!owner) {
      const ownerId = randomUUID();
      const username = buildGymOwnerUsername(gymId, gym.name);
      const password = buildGymOwnerDefaultPassword(gymId);
      await firestoreGymOwners.create({
        id: ownerId,
        gymId,
        username,
        usernameNormalized: normalizeGymOwnerUsername(username),
        passwordHash: hashPassword(password),
        name: gym.name + ' Owner',
        createdAt: new Date(),
      });
      return {
        ownerId,
        username,
        password,
        created: true,
      };
    }

    const result = await applyCanonicalGymOwnerCredentials(
      owner.id,
      gymId,
      gym.name,
      owner.username
    );

    return {
      ownerId: result.ownerId,
      username: result.username,
      password: result.password,
      created: false,
    };
  });
