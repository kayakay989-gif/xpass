import { adminProcedure } from "../../../create-context";
import { firestoreCheckIns, firestoreUsers, firestoreGyms, firestoreSubscriptions } from "@/backend/lib/firestore-admin";
import { getAuthPhotoUrls, resolveUserPhotoUrl } from "@/backend/lib/user-photo";

export default adminProcedure.query(async () => {
  const checkIns = await firestoreCheckIns.getAll();
  const uniqueUserIds = [...new Set(checkIns.map((checkIn) => checkIn.userId))];

  const usersById = new Map<string, Awaited<ReturnType<typeof firestoreUsers.getById>>>();
  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const user = await firestoreUsers.getById(userId);
      if (user) usersById.set(userId, user);
    })
  );

  const missingPhotoUserIds = uniqueUserIds.filter(
    (userId) => !resolveUserPhotoUrl(usersById.get(userId) || null)
  );
  const authPhotoUrls = await getAuthPhotoUrls(missingPhotoUserIds);

  const enrichedCheckIns = await Promise.all(
    checkIns.map(async (checkIn) => {
      const user = usersById.get(checkIn.userId);
      const gym = await firestoreGyms.getById(checkIn.gymId);
      const subscription = await firestoreSubscriptions.getByUserId(checkIn.userId);

      return {
        ...checkIn,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || '',
        userPhotoUrl: resolveUserPhotoUrl(user, authPhotoUrls.get(checkIn.userId)),
        gymName: gym?.name || 'Unknown Gym',
        tier: subscription?.tier || 'none',
      };
    })
  );

  return enrichedCheckIns.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
});
