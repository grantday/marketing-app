import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const PREFIX = 'reach_';

export function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(24).toString('hex');
  const fullKey = `${PREFIX}${secret}`;
  const prefix = fullKey.slice(0, 12);
  const hash = bcrypt.hashSync(fullKey, 10);
  return { fullKey, prefix, hash };
}

export function verifyApiKey(fullKey: string, hash: string): boolean {
  return bcrypt.compareSync(fullKey, hash);
}

export function extractApiKey(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const header = req.headers['x-api-key'];
  if (typeof header === 'string') return header.trim();
  return null;
}
