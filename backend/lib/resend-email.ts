/**
 * Shared Resend HTTP API helper (transactional email).
 * Domain: configure SUBSCRIPTION_EMAIL_FROM with your verified Resend domain (e.g. noreply@xpassjo.com).
 */

export function getResendFromAddress(): string {
  return (
    process.env.SUBSCRIPTION_EMAIL_FROM?.trim() ||
    'Xpass <noreply@xpassjo.com>'
  );
}

export async function sendResendHtmlEmail(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('[ResendEmail] RESEND_API_KEY is missing. Skipping email.', {
      to: input.to,
      subject: input.subject,
    });
    return;
  }

  const to = input.to?.trim();
  if (!to) {
    console.warn('[ResendEmail] Missing recipient. Skipping.');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from || getResendFromAddress(),
      to: [to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[ResendEmail] Failed (${response.status}): ${errorText}`);
  }
}
