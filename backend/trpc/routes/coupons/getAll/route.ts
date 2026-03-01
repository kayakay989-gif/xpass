import { adminProcedure } from '../../../create-context';
import { firestoreCoupons } from '@/backend/lib/firestore-admin';

export default adminProcedure.query(async () => {
  const coupons = await firestoreCoupons.getAll();
  return coupons;
});
