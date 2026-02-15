import { adminProcedure } from "../../../create-context";
import { firestoreUsers, firestoreSubscriptions } from "@/backend/lib/firestore-admin";

export default adminProcedure.query(async () => {
  const users = await firestoreUsers.getAll();
  
  const usersWithSubscriptions = await Promise.all(
    users.map(async (user) => {
      const subscription = await firestoreSubscriptions.getByUserId(user.id);
      return {
        ...user,
        subscription: subscription || null,
      };
    })
  );
  
  return usersWithSubscriptions;
});
