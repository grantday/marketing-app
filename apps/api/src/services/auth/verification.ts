async function sendSystemEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Reach <onboarding@reach.local>';
  if (!apiKey) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}

export async function sendVerificationEmail(
  to: string,
  fullName: string,
  token: string,
): Promise<string> {
  const base = process.env.CLIENT_ORIGIN || 'http://localhost:5174';
  const link = `${base}/verify-email?token=${token}`;

  const html = `
    <h2>Verify your Reach account</h2>
    <p>Hi ${fullName},</p>
    <p>Click the link below to verify your email and start using Reach:</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link expires in 24 hours.</p>
  `;

  const sent = await sendSystemEmail(to, 'Verify your Reach account', html);
  if (!sent && process.env.NODE_ENV === 'production') {
    throw new Error('Could not send verification email. Set RESEND_API_KEY and EMAIL_FROM.');
  }
  if (!sent) {
    console.log(`[dev] Verification link for ${to}: ${link}`);
  }
  return link;
}
