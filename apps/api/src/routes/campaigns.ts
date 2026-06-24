import { Router } from 'express';
import { campaignCreateSchema } from '@reach/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { parseJsonObject, stringifyJson } from '../lib/phone.js';
import { filterSendableContactIds } from '../services/whatsapp/compliance.js';
import { enqueueCampaign } from '../workers/campaign.js';
import { writeAudit } from '../lib/audit.js';
import { eventBus } from '../lib/events.js';
import { assertCanSendMessages } from '../services/billing/limits.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { template: true, list: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    campaigns.map((c) => ({
      ...c,
      variableMapping: parseJsonObject(c.variableMapping),
      channelStrategy: parseJsonObject(c.channelStrategy),
      abTestJson: parseJsonObject(c.abTestJson),
    })),
  );
});

router.get('/:id', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: { template: true, list: true },
  });
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const [recipients, totalRecipients] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      include: { contact: true },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.campaignRecipient.count({ where: { campaignId: campaign.id } }),
  ]);

  const allForStats = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId: campaign.id },
    _count: true,
  });
  const countBy = Object.fromEntries(allForStats.map((r) => [r.status, r._count]));
  const stats = {
    total: totalRecipients,
    queued: countBy.Queued ?? 0,
    sent: (countBy.Sent ?? 0) + (countBy.Delivered ?? 0) + (countBy.Read ?? 0),
    delivered: (countBy.Delivered ?? 0) + (countBy.Read ?? 0),
    read: countBy.Read ?? 0,
    failed: countBy.Failed ?? 0,
    skipped: countBy.Skipped ?? 0,
  };

  res.json({
    ...campaign,
    variableMapping: parseJsonObject(campaign.variableMapping),
    channelStrategy: parseJsonObject(campaign.channelStrategy),
    abTestJson: parseJsonObject(campaign.abTestJson),
    recipients,
    pagination: { page, limit, total: totalRecipients, pages: Math.ceil(totalRecipients / limit) },
    stats,
  });
});

router.get('/:id/export', requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: {
      template: true,
      recipients: { include: { contact: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const header = 'name,phone,status,sentAt,deliveredAt,readAt,error';
  const rows = campaign.recipients.map((r) => {
    const cols = [
      r.contact.name ?? '',
      r.contact.phoneE164,
      r.status,
      r.sentAt?.toISOString() ?? '',
      r.deliveredAt?.toISOString() ?? '',
      r.readAt?.toISOString() ?? '',
      (r.errorMessage ?? '').replace(/,/g, ';'),
    ];
    return cols.map((c) => `"${c}"`).join(',');
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaign.name.replace(/\W+/g, '-')}.csv"`);
  res.send([header, ...rows].join('\n'));
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = campaignCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const orgId = req.user!.organizationId;
  const [template, list] = await Promise.all([
    prisma.messageTemplate.findFirst({
      where: { id: parsed.data.templateId, organizationId: orgId, status: 'Approved' },
    }),
    prisma.contactList.findFirst({
      where: { id: parsed.data.listId, organizationId: orgId },
    }),
  ]);
  if (!template) return res.status(400).json({ error: 'Template not found or not approved' });
  if (!list) return res.status(400).json({ error: 'List not found' });

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  const channelStrategy = parsed.data.channelStrategy;
  const abTestJson = parsed.data.abTest;
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: orgId,
      name: parsed.data.name,
      templateId: template.id,
      listId: list.id,
      variableMapping: stringifyJson(parsed.data.variableMapping ?? {}),
      channelStrategy: stringifyJson(channelStrategy ?? {}),
      abTestJson: stringifyJson(abTestJson ?? {}),
      scheduledAt,
      status: scheduledAt && scheduledAt > new Date() ? 'Scheduled' : 'Draft',
      createdById: req.user!.userId,
    },
    include: { template: true, list: true },
  });

  res.status(201).json({ ...campaign, variableMapping: parseJsonObject(campaign.variableMapping) });
});

router.post('/:id/prepare', requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: { list: { include: { members: true } } },
  });
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  const memberIds = campaign.list.members.map((m) => m.contactId);
  const sendable = await filterSendableContactIds(memberIds, req.user!.organizationId);

  await prisma.campaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
  for (const contactId of sendable) {
    await prisma.campaignRecipient.create({
      data: { campaignId: campaign.id, contactId, status: 'Queued' },
    });
  }

  res.json({ recipients: sendable.length, skipped: memberIds.length - sendable.length });
});

router.post('/:id/send', requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  if (!['Draft', 'Scheduled', 'Paused'].includes(campaign.status)) {
    return res.status(400).json({ error: 'Campaign cannot be sent in current status' });
  }

  const recipientCount = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  if (recipientCount === 0) return res.status(400).json({ error: 'Prepare recipients first' });

  try {
    await assertCanSendMessages(req.user!.organizationId, recipientCount);
  } catch (e) {
    return res.status(402).json({ error: e instanceof Error ? e.message : 'Plan limit reached' });
  }

  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'Scheduled' },
    });
    res.json({ ok: true, status: 'Scheduled', scheduledAt: campaign.scheduledAt });
    return;
  }

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'Sending' } });
  await enqueueCampaign(campaign.id, req.user!.organizationId);
  await writeAudit(req.user!.organizationId, 'campaign.started', {
    userId: req.user!.userId,
    entityType: 'Campaign',
    entityId: campaign.id,
    details: { recipientCount },
  });
  eventBus.emitEvent({ type: 'campaign.updated', campaignId: campaign.id, organizationId: req.user!.organizationId });
  res.json({ ok: true, status: 'Sending' });
});

router.post('/:id/pause', requireAuth, async (req, res) => {
  const result = await prisma.campaign.updateMany({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId, status: 'Sending' },
    data: { status: 'Paused' },
  });
  if (result.count === 0) return res.status(400).json({ error: 'Campaign not sending' });
  eventBus.emitEvent({
    type: 'campaign.updated',
    campaignId: String(req.params.id),
    organizationId: req.user!.organizationId,
  });
  res.json({ ok: true });
});

router.post('/:id/resume', requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId, status: 'Paused' },
  });
  if (!campaign) return res.status(400).json({ error: 'Campaign not paused' });

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'Sending' } });
  await enqueueCampaign(campaign.id, req.user!.organizationId);
  eventBus.emitEvent({ type: 'campaign.updated', campaignId: campaign.id, organizationId: req.user!.organizationId });
  res.json({ ok: true });
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.user!.organizationId,
      status: { in: ['Draft', 'Scheduled', 'Sending', 'Paused'] },
    },
  });
  if (!campaign) return res.status(400).json({ error: 'Campaign cannot be cancelled' });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'Cancelled', completedAt: new Date() },
  });
  eventBus.emitEvent({ type: 'campaign.updated', campaignId: campaign.id, organizationId: req.user!.organizationId });
  res.json({ ok: true });
});

export default router;
