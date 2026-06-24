import { Router } from 'express';
import { contactListCreateSchema } from '@reach/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { parseJsonArray, stringifyJson } from '../lib/phone.js';
import { filterSendableContactIds } from '../services/whatsapp/compliance.js';
import { parseSegmentRules, filterContactsBySegment } from '../lib/segmentation.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const lists = await prisma.contactList.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    lists.map((l) => ({
      ...l,
      filterTags: parseJsonArray(l.filterTags),
      memberCount: l._count.members,
    })),
  );
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = contactListCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const list = await prisma.contactList.create({
    data: {
      organizationId: req.user!.organizationId,
      name: parsed.data.name,
      description: parsed.data.description,
      filterTags: stringifyJson(parsed.data.filterTags ?? []),
      segmentRulesJson: stringifyJson((req.body as { segmentRules?: unknown }).segmentRules ?? {}),
      optInOnly: parsed.data.optInOnly ?? true,
    },
  });
  res.status(201).json({ ...list, filterTags: parseJsonArray(list.filterTags) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const list = await prisma.contactList.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: {
      members: { include: { contact: true } },
    },
  });
  if (!list) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...list,
    filterTags: parseJsonArray(list.filterTags),
    contacts: list.members.map((m) => m.contact),
  });
});

router.post('/:id/members', requireAuth, async (req, res) => {
  const { contactIds } = req.body as { contactIds?: string[] };
  if (!contactIds?.length) return res.status(400).json({ error: 'contactIds required' });

  const list = await prisma.contactList.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!list) return res.status(404).json({ error: 'List not found' });

  let ids = contactIds;
  if (list.optInOnly) ids = await filterSendableContactIds(contactIds, req.user!.organizationId);

  for (const contactId of ids) {
    await prisma.contactListMember.upsert({
      where: { listId_contactId: { listId: list.id, contactId } },
      create: { listId: list.id, contactId },
      update: {},
    });
  }

  res.json({ added: ids.length });
});

router.post('/:id/build-from-filter', requireAuth, async (req, res) => {
  const list = await prisma.contactList.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!list) return res.status(404).json({ error: 'Not found' });

  const filterTags = parseJsonArray(list.filterTags);
  const segmentRules = parseSegmentRules(list.segmentRulesJson);
  const where: Record<string, unknown> = { organizationId: req.user!.organizationId, mergedIntoId: null };
  if (list.optInOnly) where.optInStatus = { not: 'OptedOut' };

  let contacts = await prisma.contact.findMany({ where });
  if (filterTags.length) {
    contacts = contacts.filter((c) => {
      const tags = parseJsonArray(c.tags);
      return filterTags.every((t) => tags.includes(t));
    });
  }
  if (Object.keys(segmentRules).length > 1 || segmentRules.tags?.length || segmentRules.crmStages?.length) {
    contacts = filterContactsBySegment(contacts, segmentRules);
  }

  await prisma.contactListMember.deleteMany({ where: { listId: list.id } });
  for (const c of contacts) {
    await prisma.contactListMember.create({
      data: { listId: list.id, contactId: c.id },
    });
  }

  res.json({ count: contacts.length });
});

router.delete('/:id/members/:contactId', requireAuth, async (req, res) => {
  const list = await prisma.contactList.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!list) return res.status(404).json({ error: 'List not found' });

  await prisma.contactListMember.deleteMany({
    where: { listId: list.id, contactId: String(req.params.contactId) },
  });
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const list = await prisma.contactList.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!list) return res.status(404).json({ error: 'Not found' });
  await prisma.contactList.delete({ where: { id: list.id } });
  res.json({ ok: true });
});

export default router;
