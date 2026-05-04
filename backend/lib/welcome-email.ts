import { sendResendHtmlEmail } from '@/backend/lib/resend-email';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendWelcomeEmail(input: {
  toEmail: string;
  userName?: string | null;
}): Promise<void> {
  const safeName = escapeHtml((input.userName?.trim() || 'there'));

  const html = `
    <div style="background:#f6f8fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#111827,#1f2937);padding:28px 24px;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">Xpass</div>
          <div style="margin-top:8px;color:#cbd5e1;font-size:14px;">Welcome</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 10px 0;font-size:22px;color:#0f172a;">Welcome to Xpass</h2>
          <p style="margin:0 0 18px 0;font-size:15px;color:#334155;">Hi ${safeName}, your account has been created successfully.</p>
          <p style="margin:0;font-size:15px;color:#334155;">Explore gyms, choose a membership plan, and start training with Jordan&apos;s gym network.</p>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#fafafa;font-size:12px;color:#64748b;">
          This message was sent from Xpass (xpassjo.com).
        </div>
      </div>
    </div>
  `;

  await sendResendHtmlEmail({
    to: input.toEmail,
    subject: 'Welcome to Xpass',
    html,
  });
}
