import { publicProcedure } from "../../../create-context";
import { z } from "zod";
import { firestoreGymOwners, firestoreGyms } from "@/backend/lib/firestore-admin";
import { createGymOwnerSession } from "@/backend/lib/gym-owner-auth";
import { hashPassword, verifyPassword } from "@/backend/lib/password";
import admin from "@/backend/lib/firebase-admin";

export default publicProcedure
  .input(z.object({
    username: z.string(),
    password: z.string(),
  }))
  .mutation(async ({ input }) => {
    try {
      const gymOwner = await firestoreGymOwners.getByUsername(input.username);
      
      if (!gymOwner) {
        throw new Error('Invalid username or password');
      }
      
      // Password verification:
      // - Prefer passwordHash (pbkdf2) in production
      // - Allow legacy plaintext `password` for migration, then upgrade to passwordHash.
      const hasHash = typeof gymOwner.passwordHash === 'string' && gymOwner.passwordHash.length > 0;
      const legacyPlain = typeof gymOwner.password === 'string' ? gymOwner.password : '';

      const ok = hasHash
        ? verifyPassword(input.password, gymOwner.passwordHash!)
        : legacyPlain === input.password;

      if (!ok) throw new Error('Invalid username or password');

      // Upgrade legacy/weak hashes to pbkdf2 (best-effort)
      if (!hasHash || (gymOwner.passwordHash && !gymOwner.passwordHash.startsWith('pbkdf2:'))) {
        try {
          const passwordHash = hashPassword(input.password);
          await admin
            .firestore()
            .collection('gymOwners')
            .doc(gymOwner.id)
            .set({ passwordHash }, { merge: true });
        } catch {
          // non-fatal
        }
      }
      
      // Get gym details
      const gym = await firestoreGyms.getById(gymOwner.gymId);
      
      if (!gym) {
        throw new Error('Gym not found. Please contact administrator.');
      }

      // Create session token for subsequent authenticated gym-owner calls
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
    } catch (error: any) {
      // Re-throw tRPC errors as-is
      if (error?.message) {
        throw error;
      }
      
      // Wrap unexpected errors
      throw new Error(error?.message || 'An unexpected error occurred during login');
    }
  });

