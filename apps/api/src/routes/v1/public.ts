import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireApiKey, requireScope } from '../../middleware/apiKey.js';
import { parseJsonArray, stringifyJson } from '../../lib/phone.js';
import { buildUnifiedTimeline } from '../../services/activity/index.js';
import { normalizePhone } from '../../lib/phone.js';
import { dispatchWebhooks } from '../../services/webhooks/outbound.js';

const router = Router();

router.use(requireApiKey);

router.get('/contacts', requireScope('read'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId: orgId, mergedIntoId: null },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where: { organizationId: orgId, mergedIntoId: null } }),
  ]);

  res.json({
    items: contacts.map((c) => ({
      id: c.id,
      phoneE164: c.phoneE164,
      email: c.email,
      name: c.name,
      tags: parseJsonArray(c.tags),
      optInStatus: c.optInStatus,
      engagementScore: c.engagementScore,
      crmLeadId: c.crmLeadId,
      createdAt: c.createdAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.post('/contacts', requireScope('write'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const { phoneE164, email, name, tags, optInStatus } = req.body as {
    phoneE164?: string;
    email?: string;
    name?: string;
    tags?: string[];
    optInStatus?: string;
  };
  const phone = normalizePhone(phoneE164 ?? '');
  if (!phone) return res.status(400).json({ error: 'phoneE164 required' });

  const contact = await prisma.contact.upsert({
    where: { organizationId_phoneE164: { organizationId: orgId, phoneE164: phone } },
    create: {
      organizationId: orgId,
      phoneE164: phone,
      email: email ?? null,
      name: name ?? null,
      tags: stringifyJson(tags ?? []),
      optInStatus: optInStatus ?? 'Unknown',
      source: 'api',
    },
    update: {
      email: email ?? undefined,
      name: name ?? undefined,
      tags: tags ? stringifyJson(tags) : undefined,
    },
  });

  await dispatchWebhooks(orgId, 'contact.created', {
    contactId: contact.id,
    phoneE164: contact.phoneE164,
    name: contact.name,
  });

  res.status(201).json({
    id: contact.id,
    phoneE164: contact.phoneE164,
    email: contact.email,
    name: contact.name,
  });
});

router.get('/contacts/:id/timeline', requireScope('read'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const contact = await prisma.contact.findFirst({
    where: { id: String(req.params.id), organizationId: orgId },
  });
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const timeline = await buildUnifiedTimeline(contact.id, orgId);
  res.json({ contactId: contact.id, items: timeline });
});

router.get('/messages/recent', requireScope('read'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 3600000);

  const messages = await prisma.message.findMany({
    where: {
      direction: 'Inbound',
      createdAt: { gt: since },
      conversation: { organizationId: orgId },
    },
    include: {
      conversation: { include: { contact: { select: { id: true, phoneE164: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json(
    messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      contact: m.conversation.contact,
      conversationId: m.conversation.id,
    })),
  );
});

router.get('/campaigns', requireScope('read'), async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: req.apiKey!.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, name: true, status: true, createdAt: true, completedAt: true },
  });
  res.json(campaigns);
});

export default router;
