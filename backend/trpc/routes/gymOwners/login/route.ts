import { TRPCError } from '@trpc/server';
import { publicProcedure } from '../../../create-context';
import { z } from 'zod';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { createGymOwnerSession } from '@/backend/lib/gym-owner-auth';
import { hashPassword, verifyPassword } from '@/backend/lib/password';
import { logGymOwnerLogin, parseRequestMeta } from '@/backend/lib/gym-owner-login-log';
import { verifyGymOwnerPassword } from '@/backend/lib/gym-owner-password';
import {
  normalizeGymOwnerUsername,
  sanitizeGymOwnerPassword,
  stripInvisibleUsernameChars,
} from '@/lib/gym-owner-username';
import admin from '@/backend/lib/firebase-admin';

export default publicProcedure
  .input(z.object({
    username: z.string(),
    password: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    const receivedUsername = input.username;
    const username = stripInvisibleUsernameChars(receivedUsername).trim();
    const password = sanitizeGymOwnerPassword(input.password);
    const normalizedUsername = normalizeGymOwnerUsername(username);
    const { origin, userAgent } = parseRequestMeta(ctx.req);

    const logBase = {
      receivedUsernameLength: receivedUsername.length,
      normalizedUsername,
      origin,
      userAgent,
    };

    logGymOwnerLogin({
      event: 'gym_owner_login_attempt',
      ...logBase,
      userFound: false,
    });

    if (!username || !password) {
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: false,
        reason: 'empty_credentials',
        apiResponseCode: 'BAD_REQUEST',
      });
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Please enter both username and password',
      });
    }

    const lookup = await firestoreGymOwners.findByLoginUsername(username);
    const gymOwner = lookup.owner;

    if (!gymOwner) {
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: false,
        lookupMethod: lookup.lookupMethod,
        reason: 'user_not_found',
        apiResponseCode: 'UNAUTHORIZED',
      });
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    const hasHash = typeof gymOwner.passwordHash === 'string' && gymOwner.passwordHash.length > 0;
    const legacyPlain = typeof gymOwner.password === 'string' ? gymOwner.password.trim() : '';

    const ok = hasHash
      ? verifyGymOwnerPassword(gymOwner.gymId, password, gymOwner.passwordHash!)
      : legacyPlain === password;

    if (!ok) {
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: true,
        passwordVerified: false,
        lookupMethod: lookup.lookupMethod,
        ownerId: gymOwner.id,
        gymId: gymOwner.gymId,
        reason: 'password_mismatch',
        apiResponseCode: 'UNAUTHORIZED',
      });
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    // Best-effort: fix legacy usernames and add usernameNormalized for indexed lookup
    try {
      await firestoreGymOwners.ensureUsernameCanonical(gymOwner);
    } catch (e) {
      console.warn('[GymOwnerAuth] ensureUsernameCanonical failed (non-fatal):', e);
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
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: true,
        passwordVerified: true,
        lookupMethod: lookup.lookupMethod,
        ownerId: gymOwner.id,
        gymId: gymOwner.gymId,
        reason: 'gym_not_found',
        apiResponseCode: 'NOT_FOUND',
      });
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

    logGymOwnerLogin({
      event: 'gym_owner_login_success',
      ...logBase,
      userFound: true,
      passwordVerified: true,
      lookupMethod: lookup.lookupMethod,
      ownerId: gymOwner.id,
      gymId: gymOwner.gymId,
      apiResponseCode: 'OK',
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
