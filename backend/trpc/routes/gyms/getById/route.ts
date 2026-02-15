import { z } from 'zod';
import { publicProcedure } from '@/backend/trpc/create-context';
import { firestoreGyms } from '@/backend/lib/firestore-admin';

export default publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const gym = await firestoreGyms.getById(input.id);
    
    if (!gym) {
      throw new Error('Gym not found');
    }
    
    return gym;
  });
