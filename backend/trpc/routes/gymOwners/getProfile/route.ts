import { gymOwnerOrAdminProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { firestoreGymOwners, firestoreGyms } from "@/backend/lib/firestore-admin";

export default gymOwnerOrAdminProcedure
  .input(
    z.object({
      gymId: z.string(),
    })
  )
  .query(async ({ input, ctx }) => {
    if (!ctx.isAdmin && ctx.gymOwner?.gymId !== input.gymId) {
      throw new Error("Unauthorized");
    }
    const [gym, owner] = await Promise.all([
      firestoreGyms.getById(input.gymId),
      firestoreGymOwners.getByGymId(input.gymId),
    ]);

    if (!gym) {
      throw new Error("Gym not found");
    }

    return {
      gym,
      owner: owner
        ? {
            id: owner.id,
            gymId: owner.gymId,
            username: owner.username,
            name: owner.name,
            email: owner.email,
          }
        : null,
    };
  });

