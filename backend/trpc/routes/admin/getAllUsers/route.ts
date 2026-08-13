import { adminProcedure } from "../../../create-context";
import { firestoreUsers, firestoreSubscriptions } from "@/backend/lib/firestore-admin";
import { enrichUsersForAdmin } from "@/backend/lib/enrich-users-with-auth";

export default adminProcedure.query(async () => {
  const users = await firestoreUsers.getAll();
  const enrichedUsers = await enrichUsersForAdmin(users);

  const usersWithSubscriptions = await Promise.all(
    enrichedUsers.map(async (user) => {
      const subscription = await firestoreSubscriptions.getByUserId(user.id);
      return {
        ...user,
        subscription: subscription || null,
      };
    })
  );

  return usersWithSubscriptions;
});
