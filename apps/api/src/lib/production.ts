import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_PROD_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'CLIENT_ORIGIN',
] as const;

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function validateProductionEnv(): void {
  if (!isProduction()) return;

  const missing = REQUIRED_PROD_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(`[reach] Missing required production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const encKey = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (encKey.length < 32) {
    console.error('[reach] TOKEN_ENCRYPTION_KEY must be at least 32 characters in production');
    process.exit(1);
  }

  if ((process.env.JWT_SECRET ?? '').length < 32) {
    console.warn('[reach] JWT_SECRET should be at least 32 random characters in production');
  }
}

/** Path to built web assets when SERVE_WEB=true (monorepo layout). */
export function getWebDistPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../web/dist');
}
