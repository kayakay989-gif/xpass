import { TRPCError } from '@trpc/server';
import { publicProcedure } from '../../../create-context';
import { z } from 'zod';
import { firestoreGymOwners, firestoreGyms } from '@/backend/lib/firestore-admin';
import { createGymOwnerSession } from '@/backend/lib/gym-owner-auth';
import { hashPassword } from '@/backend/lib/password';
import { resolveGymOwnerForLogin } from '@/backend/lib/gym-owner-login-resolve';
import { logGymOwnerLogin, parseRequestMeta } from '@/backend/lib/gym-owner-login-log';
import { sanitizeGymOwnerPassword, sanitizeGymOwnerUsernameInput, normalizeGymOwnerUsername } from '@/lib/gym-owner-username';
import admin from '@/backend/lib/firebase-admin';

export default publicProcedure
  .input(z.object({
    username: z.string(),
    password: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    const receivedUsername = input.username;
    const preNormalizedUsername = normalizeGymOwnerUsername(
      sanitizeGymOwnerUsernameInput(receivedUsername)
    );
    const { origin, userAgent, environment } = parseRequestMeta(ctx.req);

    const logBase = {
      receivedUsernameLength: receivedUsername.length,
      normalizedUsername: preNormalizedUsername,
      origin,
      userAgent,
      environment,
    };

    logGymOwnerLogin({
      event: 'gym_owner_login_attempt',
      ...logBase,
      userFound: false,
    });

    const resolved = await resolveGymOwnerForLogin(input.username, input.password);
    const normalizedUsername = resolved.normalizedUsername;

    logBase.normalizedUsername = normalizedUsername;

    if (resolved.reason === 'empty_credentials') {
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

    if (resolved.reason === 'user_not_found') {
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: false,
        lookupMethod: resolved.lookupMethod,
        candidateCount: resolved.candidateCount,
        reason: 'user_not_found',
        apiResponseCode: 'UNAUTHORIZED',
      });
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    const gymOwner = resolved.owner;
    if (!gymOwner || resolved.reason === 'password_mismatch') {
      logGymOwnerLogin({
        event: 'gym_owner_login_failure',
        ...logBase,
        userFound: resolved.candidateCount > 0,
        passwordVerified: false,
        lookupMethod: resolved.lookupMethod,
        candidateCount: resolved.candidateCount,
        reason: 'password_mismatch',
        apiResponseCode: 'UNAUTHORIZED',
      });
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid username or password',
      });
    }

    const hasHash = typeof gymOwner.passwordHash === 'string' && gymOwner.passwordHash.length > 0;

    // Best-effort: fix legacy usernames and add usernameNormalized for indexed lookup
    try {
      await firestoreGymOwners.ensureUsernameCanonical(gymOwner);
    } catch (e) {
      console.warn('[GymOwnerAuth] ensureUsernameCanonical failed (non-fatal):', e);
    }

    // Upgrade legacy/weak hashes to pbkdf2 (best-effort)
    const submittedPassword = sanitizeGymOwnerPassword(input.password);
    if (
      submittedPassword &&
      (!hasHash || (gymOwner.passwordHash && !gymOwner.passwordHash.startsWith('pbkdf2:')))
    ) {
      try {
        const passwordHash = hashPassword(submittedPassword);
        await admin
          .firestore()
          .collection('gymOwners')
          .doc(gymOwner.id)
          .set(
            {
              passwordHash,
              password: admin.firestore.FieldValue.delete(),
            },
            { merge: true }
          );
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
        lookupMethod: resolved.lookupMethod,
        candidateCount: resolved.candidateCount,
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
      lookupMethod: resolved.lookupMethod,
      candidateCount: resolved.candidateCount,
      ownerId: gymOwner.id,
      gymId: gymOwner.gymId,
      matchedOwnerId: resolved.matchedOwnerId,
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
