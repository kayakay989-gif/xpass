import { Subscription } from '@/types';
import { sendResendHtmlEmail } from '@/backend/lib/resend-email';

type SubscriptionEmailInput = {
  toEmail: string;
  userName?: string | null;
  subscription: Subscription;
  orderId?: string | null;
  paymentId?: string | null;
  paidAmount?: number | null;
  currency?: string | null;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendSubscriptionSuccessEmail(input: SubscriptionEmailInput): Promise<void> {
  if (!input.toEmail?.trim()) {
    console.warn('[SubscriptionEmail] Missing recipient email. Skipping subscription email.', {
      subscriptionId: input.subscription.id,
    });
    return;
  }

  const tier = input.subscription.tier.toUpperCase();
  const durationText = `${input.subscription.duration} month${input.subscription.duration > 1 ? 's' : ''}`;
  const paidAmount = input.paidAmount ?? input.subscription.totalPrice;
  const currency = input.currency || 'JOD';
  const receiptId = input.paymentId || input.orderId || input.subscription.id;
  const safeName = escapeHtml((input.userName?.trim() || 'there'));

  const html = `
    <div style="background:#f6f8fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#111827,#1f2937);padding:28px 24px;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">Xpass</div>
          <div style="margin-top:8px;color:#cbd5e1;font-size:14px;">Subscription Confirmation</div>
        </div>

        <div style="padding:24px;">
          <h2 style="margin:0 0 10px 0;font-size:22px;color:#0f172a;">Your subscription is active</h2>
          <p style="margin:0 0 18px 0;font-size:15px;color:#334155;">Hi ${safeName}, your Xpass subscription was activated successfully.</p>

          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:10px;color:#111827;">Package details</div>
            <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#475569;">Package</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${tier}</td></tr>
              <tr><td style="padding:6px 0;color:#475569;">Duration</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${durationText}</td></tr>
              <tr><td style="padding:6px 0;color:#475569;">Start date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${formatDate(input.subscription.startDate)}</td></tr>
              <tr><td style="padding:6px 0;color:#475569;">Expiry date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${formatDate(input.subscription.endDate)}</td></tr>
            </table>
          </div>

          <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:18px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:10px;color:#111827;">Payment receipt</div>
            <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#475569;">Receipt ID</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${escapeHtml(receiptId)}</td></tr>
              <tr><td style="padding:6px 0;color:#475569;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#16a34a;">${formatAmount(paidAmount, currency)}</td></tr>
            </table>
          </div>

          <p style="margin:0;font-size:14px;color:#475569;">Thanks for choosing Xpass. We are excited to have you with us.</p>
        </div>

        <div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#fafafa;font-size:12px;color:#64748b;">
          This is an automated receipt from Xpass.
        </div>
      </div>
    </div>
  `;

  await sendResendHtmlEmail({
    to: input.toEmail.trim(),
    subject: 'Your Xpass payment receipt & subscription confirmation',
    html,
  });
}
