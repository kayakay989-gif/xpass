import { adminProcedure } from "../../../create-context";
import { z } from "zod";
import { firestoreGyms, firestoreGymOwners } from "@/backend/lib/firestore-admin";

export default adminProcedure
  .input(z.object({
    id: z.string(),
  }))
  .mutation(async ({ input }) => {
    try {
      // Delete the gym
      await firestoreGyms.delete(input.id);
      
      // Also delete associated gym owner if exists
      const gymOwner = await firestoreGymOwners.getByGymId(input.id);
      if (gymOwner) {
        await firestoreGymOwners.delete(gymOwner.id);
      }
      
      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete gym: ${error.message}`);
    }
  });
