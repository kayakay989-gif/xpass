import { adminProcedure } from "../../../create-context";
import { firestoreGyms, firestoreCheckIns } from "@/backend/lib/firestore-admin";
import { isSameAmmanCalendarDay } from "@/lib/jordan-time";

export default adminProcedure.query(async () => {
  const gyms = await firestoreGyms.getAll();
  const allCheckIns = await firestoreCheckIns.getAll();
  
  const gymsWithStats = gyms.map((gym) => {
    const gymCheckIns = allCheckIns.filter((ci) => ci.gymId === gym.id);
    
    const now = new Date();
    const todayCheckIns = gymCheckIns.filter((ci) =>
      isSameAmmanCalendarDay(new Date(ci.timestamp), now)
    );
    
    return {
      ...gym,
      totalCheckIns: gymCheckIns.length,
      todayCheckIns: todayCheckIns.length,
    };
  });
  
  return gymsWithStats;
});
