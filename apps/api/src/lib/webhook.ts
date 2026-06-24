import crypto from 'crypto';

export function verifyMetaWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader.replace(/^sha256=/, '');
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const hash = crypto.createHmac('sha256', appSecret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
  } catch {
    return false;
  }
}
