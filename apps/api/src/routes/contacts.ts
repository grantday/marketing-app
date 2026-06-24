import { Router } from 'express';
import { contactCreateSchema } from '@reach/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { normalizePhone, parseJsonArray, parseJsonObject, stringifyJson } from '../lib/phone.js';
import { parseCsv, pickField } from '../lib/csv.js';
import { writeAudit } from '../lib/audit.js';
import { assertCanAddContacts } from '../services/billing/limits.js';

const router = Router();

function formatContact(c: {
  id: string;
  phoneE164: string;
  email: string | null;
  name: string | null;
  tags: string;
  optInStatus: string;
  source: string | null;
  customFields: string;
  crmLeadId: string | null;
  engagementScore: number;
  createdAt: Date;
}) {
  return {
    ...c,
    tags: parseJsonArray(c.tags),
    customFields: parseJsonObject(c.customFields),
  };
}

router.get('/', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId;
  const { q, tag, optIn } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { organizationId: orgId };
  if (optIn) where.optInStatus = String(optIn);
  if (tag) where.tags = { contains: String(tag) };

  if (q) {
    const term = String(q);
    where.OR = [
      { phoneE164: { contains: term } },
      { name: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  res.json({
    items: contacts.map(formatContact),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = contactCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const phone = normalizePhone(parsed.data.phoneE164);
  if (!phone) return res.status(400).json({ error: 'Invalid phone' });

  const existing = await prisma.contact.findUnique({
    where: {
      organizationId_phoneE164: {
        organizationId: req.user!.organizationId,
        phoneE164: phone,
      },
    },
  });
  if (!existing) {
    try {
      await assertCanAddContacts(req.user!.organizationId, 1);
    } catch (e) {
      return res.status(402).json({ error: e instanceof Error ? e.message : 'Contact limit reached' });
    }
  }

  const contact = await prisma.contact.upsert({
    where: {
      organizationId_phoneE164: {
        organizationId: req.user!.organizationId,
        phoneE164: phone,
      },
    },
    create: {
      organizationId: req.user!.organizationId,
      phoneE164: phone,
      email: parsed.data.email ?? null,
      name: parsed.data.name,
      tags: stringifyJson(parsed.data.tags ?? []),
      optInStatus: parsed.data.optInStatus ?? 'Unknown',
      source: parsed.data.source,
      customFields: stringifyJson(parsed.data.customFields ?? {}),
    },
    update: {
      name: parsed.data.name ?? undefined,
      email: parsed.data.email ?? undefined,
      tags: parsed.data.tags ? stringifyJson(parsed.data.tags) : undefined,
      optInStatus: parsed.data.optInStatus ?? undefined,
      customFields: parsed.data.customFields ? stringifyJson(parsed.data.customFields) : undefined,
    },
  });

  res.status(201).json(formatContact(contact));
});

router.get('/:id/timeline', requireAuth, async (req, res) => {
  const contact = await prisma.contact.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const { buildUnifiedTimeline } = await import('../services/activity/index.js');
  const items = await buildUnifiedTimeline(contact.id, req.user!.organizationId);
  res.json({ contactId: contact.id, engagementScore: contact.engagementScore, items });
});

router.get('/:id', requireAuth, async (req, res) => {
  const contact = await prisma.contact.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(formatContact(contact));
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { name, email, tags, optInStatus, customFields } = req.body as {
    name?: string;
    email?: string;
    tags?: string[];
    optInStatus?: string;
    customFields?: Record<string, unknown>;
  };

  const existing = await prisma.contact.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const data: Record<string, unknown> = {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email: email || null } : {}),
    ...(tags ? { tags: stringifyJson(tags) } : {}),
    ...(optInStatus ? { optInStatus } : {}),
    ...(customFields ? { customFields: stringifyJson(customFields) } : {}),
  };
  if (optInStatus === 'OptedIn') {
    data.consentedAt = new Date();
  }

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data,
  });

  if (tags) {
    const oldTags = parseJsonArray(existing.tags);
    const newTags = tags;
    const added = newTags.filter((t) => !oldTags.includes(t));
    if (added.length) {
      const { onTagAdded } = await import('../services/chatbot/index.js');
      for (const tag of added) {
        await onTagAdded(req.user!.organizationId, contact.id, tag);
      }
    }
  }

  if (optInStatus === 'OptedOut') {
    await writeAudit(req.user!.organizationId, 'contact.opt_out', {
      userId: req.user!.userId,
      entityType: 'Contact',
      entityId: contact.id,
      details: { manual: true },
    });
  }

  res.json(formatContact(contact));
});

router.post('/import', requireAuth, async (req, res) => {
  const { csv, consentConfirmed, defaultOptIn } = req.body as {
    csv?: string;
    consentConfirmed?: boolean;
    defaultOptIn?: string;
  };
  if (!csv) return res.status(400).json({ error: 'csv required' });
  if (!consentConfirmed) {
    return res.status(400).json({
      error: 'You must confirm that imported contacts have consented to receive WhatsApp messages',
    });
  }

  const rows = parseCsv(csv);
  const orgId = req.user!.organizationId;
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const rawPhone = pickField(row, 'phone', 'whatsapp', 'mobile', 'phonenumber');
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      skipped++;
      continue;
    }
    const name = pickField(row, 'name', 'fullname', 'full_name', 'contact');
    const tags: string[] = [];
    const stage = pickField(row, 'stage');
    if (stage) tags.push(`stage:${stage}`);
    const services = pickField(row, 'services');
    if (services) tags.push(...services.split(/[,;]/).map((s) => s.trim()).filter(Boolean));

    await prisma.contact.upsert({
      where: { organizationId_phoneE164: { organizationId: orgId, phoneE164: phone } },
      create: {
        organizationId: orgId,
        phoneE164: phone,
        name: name || null,
        tags: stringifyJson(tags),
        optInStatus: defaultOptIn === 'OptedIn' ? 'OptedIn' : 'Unknown',
        consentedAt: new Date(),
        source: 'csv_import',
        customFields: stringifyJson({ stage, services }),
        crmLeadId: pickField(row, 'id', 'leadid') || null,
      },
      update: {
        name: name || undefined,
        tags: tags.length ? stringifyJson(tags) : undefined,
      },
    });
    imported++;
  }

  await writeAudit(orgId, 'contacts.imported', {
    userId: req.user!.userId,
    details: { imported, skipped, consentConfirmed: true },
  });

  res.json({ imported, skipped });
});

router.post('/bulk-opt-out', requireAuth, async (req, res) => {
  const { ids } = req.body as { ids?: string[] };
  if (!ids?.length) return res.status(400).json({ error: 'ids required' });

  await prisma.contact.updateMany({
    where: { id: { in: ids }, organizationId: req.user!.organizationId },
    data: { optInStatus: 'OptedOut' },
  });

  await writeAudit(req.user!.organizationId, 'contacts.bulk_opt_out', {
    userId: req.user!.userId,
    details: { count: ids.length },
  });

  res.json({ ok: true, count: ids.length });
});

router.post('/merge', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const { primaryId, duplicateId } = req.body as { primaryId?: string; duplicateId?: string };
  if (!primaryId || !duplicateId) {
    return res.status(400).json({ error: 'primaryId and duplicateId required' });
  }
  if (primaryId === duplicateId) {
    return res.status(400).json({ error: 'Cannot merge contact with itself' });
  }

  const orgId = req.user!.organizationId;
  const [primary, duplicate] = await Promise.all([
    prisma.contact.findFirst({ where: { id: primaryId, organizationId: orgId } }),
    prisma.contact.findFirst({ where: { id: duplicateId, organizationId: orgId } }),
  ]);
  if (!primary || !duplicate) return res.status(404).json({ error: 'Contact not found' });

  const primaryTags = parseJsonArray(primary.tags);
  const dupTags = parseJsonArray(duplicate.tags);
  const mergedTags = [...new Set([...primaryTags, ...dupTags])];
  const primaryCustom = parseJsonObject(primary.customFields);
  const dupCustom = parseJsonObject(duplicate.customFields);

  await prisma.contact.update({
    where: { id: primary.id },
    data: {
      name: primary.name || duplicate.name,
      tags: stringifyJson(mergedTags),
      crmLeadId: primary.crmLeadId || duplicate.crmLeadId,
      customFields: stringifyJson({ ...dupCustom, ...primaryCustom }),
      optInStatus:
        primary.optInStatus === 'OptedIn' || duplicate.optInStatus === 'OptedIn'
          ? 'OptedIn'
          : primary.optInStatus,
    },
  });

  await prisma.campaignRecipient.updateMany({
    where: { contactId: duplicate.id },
    data: { contactId: primary.id },
  });

  const dupConvo = await prisma.conversation.findUnique({
    where: { organizationId_contactId: { organizationId: orgId, contactId: duplicate.id } },
  });
  if (dupConvo) {
    const primaryConvo = await prisma.conversation.findUnique({
      where: { organizationId_contactId: { organizationId: orgId, contactId: primary.id } },
    });
    if (primaryConvo) {
      await prisma.message.updateMany({
        where: { conversationId: dupConvo.id },
        data: { conversationId: primaryConvo.id },
      });
      await prisma.conversationNote.updateMany({
        where: { conversationId: dupConvo.id },
        data: { conversationId: primaryConvo.id },
      });
      await prisma.conversation.delete({ where: { id: dupConvo.id } });
    } else {
      await prisma.conversation.update({
        where: { id: dupConvo.id },
        data: { contactId: primary.id },
      });
    }
  }

  await prisma.workflowEnrollment.updateMany({
    where: { contactId: duplicate.id },
    data: { contactId: primary.id },
  });

  await prisma.contactListMember.updateMany({
    where: { contactId: duplicate.id },
    data: { contactId: primary.id },
  });

  await prisma.contact.update({
    where: { id: duplicate.id },
    data: { mergedIntoId: primary.id, phoneE164: `${duplicate.phoneE164}_merged_${Date.now()}` },
  });

  await writeAudit(orgId, 'contact.merged', {
    userId: req.user!.userId,
    details: { primaryId, duplicateId },
  });

  const updated = await prisma.contact.findUnique({ where: { id: primary.id } });
  res.json(formatContact(updated!));
});

export default router;
