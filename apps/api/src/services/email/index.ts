import { prisma } from '../../lib/prisma.js';
import { parseJsonObject } from '../../lib/phone.js';

interface EmailConfig {
  provider?: 'resend';
  apiKey?: string;
}

export async function getEmailConfig(organizationId: string): Promise<EmailConfig & { from: string | null }> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const envKey = process.env.RESEND_API_KEY;
  const parsed = parseJsonObject(org?.emailProviderJson ?? '{}') as EmailConfig;
  return {
    provider: parsed.provider ?? 'resend',
    apiKey: parsed.apiKey || envKey,
    from: org?.emailFromAddress ?? process.env.EMAIL_FROM ?? null,
  };
}

export async function sendEmail(
  organizationId: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ id: string }> {
  const cfg = await getEmailConfig(organizationId);
  if (!cfg.apiKey || !cfg.from) {
    throw new Error('Email not configured. Set RESEND_API_KEY and email from address in Settings.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html }),
  });

  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(data.message ?? `Resend error ${res.status}`);
  return { id: data.id ?? '' };
}
