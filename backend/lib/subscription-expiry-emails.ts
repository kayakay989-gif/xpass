import admin from '@/backend/lib/firebase-admin';
import { adminDb } from '@/backend/lib/firebase-admin';
import { firestoreSubscriptions, firestoreUsers } from '@/backend/lib/firestore-admin';
import { Subscription } from '@/types';
import { sendResendHtmlEmail } from '@/backend/lib/resend-email';
import { notifySubscriptionExpiringSoon } from '@/backend/lib/push-notifications';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Jordan local calendar day (YYYY-MM-DD). Expiry logic follows midnight Asia/Amman, not UTC. */
const JORDAN_TZ = 'Asia/Amman';

function ammanCalendarDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: JORDAN_TZ });
}

/** Whole calendar days from Jordan “today” to Jordan end date (same as UTC-date math on YYYY-MM-DD). */
function ammanCalendarDaysFromTodayToEnd(todayYmd: string, endYmd: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(endYmd) - parse(todayYmd)) / (24 * 60 * 60 * 1000));
}

function formatDateAmman(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JORDAN_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

async function sendExpiryReminderEmail(input: {
  toEmail: string;
  userName?: string | null;
  subscription: Subscription;
}): Promise<void> {
  const tier = input.subscription.tier.toUpperCase();
  const safeName = escapeHtml((input.userName?.trim() || 'there'));
  const end = formatDateAmman(input.subscription.endDate);

  const html = `
    <div style="background:#f6f8fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7c2d12,#ea580c);padding:28px 24px;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;">Xpass</div>
          <div style="margin-top:8px;color:#ffedd5;font-size:14px;">Membership reminder</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 10px 0;font-size:22px;color:#0f172a;">Your plan expires in 3 days</h2>
          <p style="margin:0 0 18px 0;font-size:15px;color:#334155;">Hi ${safeName}, this is a reminder that your <strong>${tier}</strong> Xpass membership will end on <strong>${end}</strong>.</p>
          <p style="margin:0;font-size:15px;color:#334155;">Renew before expiry to keep uninterrupted access to your gyms.</p>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#fafafa;font-size:12px;color:#64748b;">
          Xpass · xpassjo.com
        </div>
      </div>
    </div>
  `;

  await sendResendHtmlEmail({
    to: input.toEmail,
    subject: `Your Xpass membership ends on ${end} (3 days left)`,
    html,
  });
}

async function sendPackageExpiredEmail(input: {
  toEmail: string;
  userName?: string | null;
  subscription: Subscription;
}): Promise<void> {
  const tier = input.subscription.tier.toUpperCase();
  const safeName = escapeHtml((input.userName?.trim() || 'there'));
  const end = formatDateAmman(input.subscription.endDate);

  const html = `
    <div style="background:#f6f8fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:28px 24px;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;">Xpass</div>
          <div style="margin-top:8px;color:#cbd5e1;font-size:14px;">Membership status</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 10px 0;font-size:22px;color:#0f172a;">Your membership has ended</h2>
          <p style="margin:0 0 18px 0;font-size:15px;color:#334155;">Hi ${safeName}, your <strong>${tier}</strong> plan reached its end date on <strong>${end}</strong>.</p>
          <p style="margin:0;font-size:15px;color:#334155;">Subscribe again anytime in the Xpass app to continue enjoying partner gyms.</p>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#fafafa;font-size:12px;color:#64748b;">
          Xpass · xpassjo.com
        </div>
      </div>
    </div>
  `;

  await sendResendHtmlEmail({
    to: input.toEmail,
    subject: 'Your Xpass membership has expired',
    html,
  });
}

/**
 * Sends 3-day reminder (active subs) and post-expiry notices (all subs, so lapsed members still get the email).
 * Idempotent via `expiryReminderEmailSentAt` / `expiredNoticeEmailSentAt` on each subscription doc.
 * “Today”, “3 days before”, and “expired” use the Jordan calendar (Asia/Amman), not UTC.
 */
export async function runSubscriptionExpiryEmailJob(): Promise<{
  remindersSent: number;
  expiredSent: number;
  skipped: number;
}> {
  if (!process.env.RESEND_API_KEY) {
    return { remindersSent: 0, expiredSent: 0, skipped: 0 };
  }

  const now = new Date();
  const todayAmman = ammanCalendarDateString(now);
  let remindersSent = 0;
  let expiredSent = 0;
  let skipped = 0;

  const subs = await firestoreSubscriptions.getAll();
  for (const sub of subs) {
    const ref = adminDb.collection('subscriptions').doc(sub.id);
    const snap = await ref.get();
    const raw = snap.data() || {};

    const user = await firestoreUsers.getById(sub.userId);
    const email = user?.email?.trim();
    if (!email) {
      skipped++;
      continue;
    }

    const endDate = sub.endDate instanceof Date ? sub.endDate : new Date(sub.endDate);
    const endAmman = ammanCalendarDateString(endDate);
    /** Jordan calendar days from today (Amman) to subscription end day (Amman): 3 = reminder window. */
    const diffDays = ammanCalendarDaysFromTodayToEnd(todayAmman, endAmman);

    // 3 calendar days before expiry — only for currently active memberships
    if (sub.isActive && diffDays === 3 && !raw.expiryReminderEmailSentAt) {
      try {
        await sendExpiryReminderEmail({
          toEmail: email,
          userName: user?.name,
          subscription: sub,
        });
        // Additive: also push the 3-day reminder (covers "passes about to expire").
        await notifySubscriptionExpiringSoon(sub.userId, sub);
        await ref.update({
          expiryReminderEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        remindersSent++;
      } catch (e) {
        console.error('[ExpiryEmail] Reminder failed', sub.id, e);
      }
      continue;
    }

    // First day after expiry (calendar): today is strictly after end date
    if (diffDays < 0 && !raw.expiredNoticeEmailSentAt) {
      try {
        await sendPackageExpiredEmail({
          toEmail: email,
          userName: user?.name,
          subscription: sub,
        });
        await ref.update({
          expiredNoticeEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        expiredSent++;
      } catch (e) {
        console.error('[ExpiryEmail] Expired notice failed', sub.id, e);
      }
    }
  }

  if (remindersSent || expiredSent) {
    console.log('[ExpiryEmail] Job complete', { remindersSent, expiredSent, skipped });
  }

  return { remindersSent, expiredSent, skipped };
}
