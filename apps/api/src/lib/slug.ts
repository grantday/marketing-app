import { randomBytes } from 'node:crypto';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

export async function uniqueOrgSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (await exists(n === 0 ? slug : `${slug}-${n}`)) {
    n++;
  }
  return n === 0 ? slug : `${slug}-${n}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
