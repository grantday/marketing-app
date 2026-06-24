import crypto from 'crypto';
import { prisma } from '../../lib/prisma.js';

const BASE = process.env.LINK_BASE_URL || 'http://localhost:3002';

export function generateLinkCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

export async function createTrackedLink(
  organizationId: string,
  destinationUrl: string,
  title?: string,
): Promise<{ id: string; code: string; shortUrl: string }> {
  let code = generateLinkCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.trackedLink.findUnique({ where: { code } });
    if (!exists) break;
    code = generateLinkCode();
  }

  const link = await prisma.trackedLink.create({
    data: { organizationId, code, destinationUrl, title: title ?? null },
  });

  return { id: link.id, code: link.code, shortUrl: `${BASE}/l/${link.code}` };
}

export async function recordClick(code: string, userAgent?: string): Promise<string | null> {
  const link = await prisma.trackedLink.findUnique({ where: { code } });
  if (!link) return null;

  await prisma.$transaction([
    prisma.trackedLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    }),
    prisma.linkClick.create({
      data: { trackedLinkId: link.id, userAgent: userAgent ?? null },
    }),
  ]);

  return link.destinationUrl;
}

export function wrapUrlsInText(text: string, organizationId: string): Promise<string> {
  return Promise.resolve(text);
}
