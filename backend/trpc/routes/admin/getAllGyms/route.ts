import { adminProcedure } from "../../../create-context";
import { firestoreGyms, firestoreCheckIns } from "@/backend/lib/firestore-admin";

export default adminProcedure.query(async () => {
  const gyms = await firestoreGyms.getAll();
  const allCheckIns = await firestoreCheckIns.getAll();
  
  const gymsWithStats = gyms.map((gym) => {
    const gymCheckIns = allCheckIns.filter((ci) => ci.gymId === gym.id);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCheckIns = gymCheckIns.filter((ci) => {
      const ciDate = new Date(ci.timestamp);
      ciDate.setHours(0, 0, 0, 0);
      return ciDate.getTime() === today.getTime();
    });
    
    return {
      ...gym,
      totalCheckIns: gymCheckIns.length,
      todayCheckIns: todayCheckIns.length,
    };
  });
  
  return gymsWithStats;
});
