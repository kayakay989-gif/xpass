import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import admin from 'firebase-admin';
import { adminProcedure } from '../../../create-context';
import { adminDb } from '@/backend/lib/firebase-admin';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { hashPassword } from '@/backend/lib/password';
import {
  normalizeGymOwnerUsername,
  sanitizeGymOwnerPassword,
  sanitizeGymOwnerUsernameInput,
} from '@/lib/gym-owner-username';

export default adminProcedure
  .input(
    z.object({
      gymId: z.string().min(1),
      username: z.string().optional(),
      newPassword: z.string().optional(),
      confirmPassword: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const gymId = input.gymId.trim();
    const gym = await firestoreGyms.getById(gymId);
    if (!gym) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Gym not found' });
    }

    const owner = await firestoreGymOwners.getByGymId(gymId);
    if (!owner) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'This gym does not have an owner login yet. Sync the login password first, then edit it.',
      });
    }

    const updates: Record<string, unknown> = {};
    let username = owner.username;

    if (input.username != null) {
      const sanitized = sanitizeGymOwnerUsernameInput(input.username);
      const normalized = normalizeGymOwnerUsername(sanitized);
      if (!/^[a-z0-9_]{3,40}$/.test(normalized)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Username must be 3 to 40 characters and use only letters, numbers, and underscores.',
        });
      }

      const matches = await firestoreGymOwners.findAllByLoginUsername(normalized);
      const taken = matches.owners.some((candidate) => candidate.id !== owner.id);
      if (taken) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'That username is already used by another gym.',
        });
      }

      updates.username = normalized;
      updates.usernameNormalized = normalized;
      username = normalized;
    }

    if (input.newPassword != null || input.confirmPassword != null) {
      const password = sanitizeGymOwnerPassword(input.newPassword || '');
      const confirm = sanitizeGymOwnerPassword(input.confirmPassword || '');
      if (password.length < 6) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Password must be at least 6 characters.',
        });
      }
      if (password !== confirm) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Password and confirmation do not match.',
        });
      }
      updates.passwordHash = hashPassword(password);
      updates.password = admin.firestore.FieldValue.delete();
      updates.passwordIsCustom = true;
    }

    if (Object.keys(updates).length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Enter a new username or a new password.',
      });
    }

    await adminDb.collection('gymOwners').doc(owner.id).update(updates);

    return {
      ownerId: owner.id,
      gymId,
      username,
      passwordIsCustom: updates.passwordIsCustom === true || owner.passwordIsCustom === true,
    };
  });
