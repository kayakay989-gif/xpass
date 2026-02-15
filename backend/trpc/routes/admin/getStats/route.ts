import { adminProcedure } from "../../../create-context";
import { firestoreUsers, firestoreGyms, firestoreCheckIns, firestoreSubscriptions } from "@/backend/lib/firestore-admin";

export default adminProcedure.query(async () => {
  const users = await firestoreUsers.getAll();
  const gyms = await firestoreGyms.getAll();
  const checkIns = await firestoreCheckIns.getAll();
  const subscriptions = await firestoreSubscriptions.getAll();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCheckIns = checkIns.filter((ci) => {
    const ciDate = new Date(ci.timestamp);
    ciDate.setHours(0, 0, 0, 0);
    return ciDate.getTime() === today.getTime();
  });
  
  const activeSubscriptions = subscriptions.filter((s) => s.isActive);
  const totalRevenue = subscriptions.reduce((sum, sub) => sum + (sub.totalPrice || 0), 0);
  
  return {
    totalUsers: users.length,
    totalGyms: gyms.length,
    totalCheckIns: checkIns.length,
    todayCheckIns: todayCheckIns.length,
    activeSubscriptions: activeSubscriptions.length,
    totalRevenue,
  };
});
