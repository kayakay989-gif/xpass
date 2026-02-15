import { adminProcedure } from "../../../create-context";
import { firestoreCheckIns, firestoreUsers, firestoreGyms, firestoreSubscriptions } from "@/backend/lib/firestore-admin";

export default adminProcedure.query(async () => {
  const checkIns = await firestoreCheckIns.getAll();
  
  const enrichedCheckIns = await Promise.all(
    checkIns.map(async (checkIn) => {
      const user = await firestoreUsers.getById(checkIn.userId);
      const gym = await firestoreGyms.getById(checkIn.gymId);
      const subscription = await firestoreSubscriptions.getByUserId(checkIn.userId);
      
      return {
        ...checkIn,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || '',
        gymName: gym?.name || 'Unknown Gym',
        tier: subscription?.tier || 'none',
      };
    })
  );
  
  return enrichedCheckIns.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
});
