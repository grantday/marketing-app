import { prisma } from '../../lib/prisma.js';
import { parseJsonObject } from '../../lib/phone.js';

interface SmsConfig {
  provider?: 'twilio';
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}

export async function getSmsConfig(organizationId: string): Promise<SmsConfig> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const parsed = parseJsonObject(org?.smsProviderJson ?? '{}') as SmsConfig;
  return {
    provider: parsed.provider ?? 'twilio',
    accountSid: parsed.accountSid || process.env.TWILIO_ACCOUNT_SID,
    authToken: parsed.authToken || process.env.TWILIO_AUTH_TOKEN,
    fromNumber: parsed.fromNumber || process.env.TWILIO_FROM_NUMBER,
  };
}

export async function sendSms(
  organizationId: string,
  to: string,
  body: string,
): Promise<{ sid: string }> {
  const cfg = await getSmsConfig(organizationId);
  if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber) {
    throw new Error('SMS not configured. Set Twilio credentials in Settings or env.');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: cfg.fromNumber, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(data.message ?? `Twilio error ${res.status}`);
  return { sid: data.sid ?? '' };
}

export function isSmsCapablePhone(phoneE164: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phoneE164);
}
