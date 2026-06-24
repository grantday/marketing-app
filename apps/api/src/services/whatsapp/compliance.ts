import { OPT_OUT_KEYWORDS } from '@reach/shared';
import { prisma } from '../../lib/prisma.js';
import { writeAudit } from '../../lib/audit.js';

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return OPT_OUT_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '));
}

export async function handleOptOutKeyword(
  organizationId: string,
  contactId: string,
  text: string,
): Promise<boolean> {
  if (!isOptOutMessage(text)) return false;

  await prisma.contact.update({
    where: { id: contactId },
    data: { optInStatus: 'OptedOut' },
  });

  await writeAudit(organizationId, 'contact.opt_out', {
    entityType: 'Contact',
    entityId: contactId,
    details: { trigger: 'keyword', message: text },
  });

  const { adjustEngagementScore } = await import('../scoring/index.js');
  await adjustEngagementScore(contactId, 'opt_out');

  const { dispatchWebhooks } = await import('../webhooks/outbound.js');
  await dispatchWebhooks(organizationId, 'contact.opt_out', { contactId, message: text });

  return true;
}

async function isStrictOptIn(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  return org?.strictOptIn ?? true;
}

export async function canSendToContact(
  contactId: string,
  organizationId?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, reason: 'Contact not found' };
  if (contact.optInStatus === 'OptedOut') return { ok: false, reason: 'Contact opted out' };

  const orgId = organizationId ?? contact.organizationId;
  const strict = await isStrictOptIn(orgId);
  if (strict && contact.optInStatus !== 'OptedIn') {
    return { ok: false, reason: `Contact not opted in (${contact.optInStatus})` };
  }

  return { ok: true };
}

export async function filterSendableContactIds(
  contactIds: string[],
  organizationId: string,
): Promise<string[]> {
  const strict = await isStrictOptIn(organizationId);
  const where = strict
    ? { id: { in: contactIds }, optInStatus: 'OptedIn' as const }
    : { id: { in: contactIds }, optInStatus: { not: 'OptedOut' as const } };

  const contacts = await prisma.contact.findMany({ where, select: { id: true } });
  return contacts.map((c) => c.id);
}
