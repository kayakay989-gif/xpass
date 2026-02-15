import { publicProcedure } from '@/backend/trpc/create-context';
import { firestoreGyms } from '@/backend/lib/firestore-admin';

export default publicProcedure.query(async () => {
  const gyms = await firestoreGyms.getAll();
  return gyms;
});
