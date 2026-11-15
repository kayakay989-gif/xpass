import { z } from 'zod';
import { adminProcedure } from '../../../create-context';
import { adminDb } from '@/backend/lib/firebase-admin';
import { firestoreSubscriptions, firestoreUsers } from '@/backend/lib/firestore-admin';
import { enrichUsersForAdmin } from '@/backend/lib/enrich-users-with-auth';
import { buildUsersWorkbook, type UserExportRow } from '@/backend/lib/admin-excel';
import { excelDate } from '@/backend/lib/excel-text';
import { formatDisplayUserName } from '@/lib/profile-validation';
import { ammanDateParts, isExpiredInAmman } from '@/lib/jordan-time';
import { subscriptionDurationLabel, subscriptionTierLabel } from '@/lib/subscription-catalog';

function readDateOfBirth(data: Record<string, unknown> | undefined): Date | null {
  if (!data) return null;
  return excelDate(data.dateOfBirth || data.dob || data.birthDate || data.date_of_birth);
}

function ageFromDateOfBirth(dateOfBirth: Date, today: Date): number | null {
  const birth = ammanDateParts(dateOfBirth);
  const current = ammanDateParts(today);
  let age = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) {
    age -= 1;
  }
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  return age;
}

function subscriptionStatus(subscription: any, now: Date): string {
  if (!subscription) return 'None';
  const endDate = subscription.endDate ? new Date(subscription.endDate) : null;
  const expired = endDate ? isExpiredInAmman(endDate, now) : false;
  if (subscription.isActive === true && !expired) return 'Active';
  if (expired) return 'Expired';
  if (typeof subscription.status === 'string' && subscription.status.trim()) return subscription.status;
  return 'Inactive';
}

export default adminProcedure
  .input(
    z.object({
      search: z.string().optional().default(''),
      status: z.enum(['active', 'inactive']).optional().default('active'),
    })
  )
  .mutation(async ({ input }) => {
    const now = new Date();
    const [users, rawUsers] = await Promise.all([
      firestoreUsers.getAll(),
      adminDb.collection('users').select('dateOfBirth', 'dob', 'birthDate', 'date_of_birth', 'age').get(),
    ]);
    const extraById = new Map(rawUsers.docs.map((doc) => [doc.id, doc.data()]));
    const enriched = await enrichUsersForAdmin(users);
    const withSubscriptions = await Promise.all(
      enriched.map(async (user) => {
        const subscription = await firestoreSubscriptions.getByUserId(user.id);
        return { ...user, subscription: subscription || null };
      })
    );

    const query = input.search.trim().toLowerCase();
    const filtered = withSubscriptions.filter((user) => {
      if (query) {
        const displayName = formatDisplayUserName(user, (user as any).authDisplayName).toLowerCase();
        const matches =
          displayName.includes(query) ||
          (user.name || '').toLowerCase().includes(query) ||
          (user.email || '').toLowerCase().includes(query) ||
          (user.phone || '').toLowerCase().includes(query) ||
          ((user as any).signInProviderLabel || '').toLowerCase().includes(query);
        if (!matches) return false;
      }

      const subscription = user.subscription;
      const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
      const expired = endDate ? isExpiredInAmman(endDate, now) : false;
      const active = !!subscription && subscription.isActive === true && !expired;
      return input.status === 'active' ? active : !active;
    });

    const rows: UserExportRow[] = filtered.map((user) => {
      const extra = extraById.get(user.id);
      const dateOfBirth = readDateOfBirth(extra);
      const storedAge = typeof user.age === 'number' ? user.age : null;
      const subscription = user.subscription;
      return {
        fullName: formatDisplayUserName(user, (user as any).authDisplayName),
        email: user.email || '',
        age: storedAge ?? (dateOfBirth ? ageFromDateOfBirth(dateOfBirth, now) : null),
        dateOfBirth,
        phone: user.phone || '',
        userId: user.id,
        registrationDate: excelDate(user.createdAt),
        subscriptionTier: subscription?.tier ? subscriptionTierLabel(subscription.tier) : '',
        subscriptionDuration:
          typeof subscription?.duration === 'number' ? subscriptionDurationLabel(subscription.duration) : '',
        subscriptionStatus: subscriptionStatus(subscription, now),
        subscriptionStart: excelDate(subscription?.startDate),
        subscriptionExpiry: excelDate(subscription?.endDate),
        walletBalance: typeof user.walletBalance === 'number' ? user.walletBalance : null,
        referralCode: user.referralCode || '',
        signInMethod: (user as any).signInProviderLabel || user.authProvider || '',
        phoneVerified: user.phoneVerified ? 'Yes' : 'No',
        profileComplete: user.profileComplete ? 'Yes' : 'No',
      };
    });

    return buildUsersWorkbook(rows);
  });
