import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getWhatsAppConfig, sendSessionMessage, sendMediaMessage } from '../services/whatsapp/index.js';
import { parseJsonArray, parseJsonObject } from '../lib/phone.js';

const router = Router();

router.get('/conversations', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;
  const orgId = req.user!.organizationId;

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId: orgId },
      include: {
        contact: true,
        assignedUser: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.conversation.count({ where: { organizationId: orgId } }),
  ]);

  res.json({
    items: conversations.map((c) => ({
      id: c.id,
      contact: {
        id: c.contact.id,
        name: c.contact.name,
        phoneE164: c.contact.phoneE164,
        tags: parseJsonArray(c.contact.tags),
        optInStatus: c.contact.optInStatus,
      },
      assignedUser: c.assignedUser,
      lastMessage: c.messages[0] ?? null,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      sessionOpen: c.sessionOpenUntil ? c.sessionOpenUntil > new Date() : false,
      priority: c.priority,
      channel: c.channel,
      slaBreached: c.slaBreached,
      resolvedAt: c.resolvedAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.get('/conversations/:id', requireAuth, async (req, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: {
      contact: true,
      assignedUser: { select: { id: true, fullName: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      notes: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { unreadCount: 0 },
  });

  res.json({
    ...conversation,
    contact: {
      ...conversation.contact,
      tags: parseJsonArray(conversation.contact.tags),
      customFields: parseJsonObject(conversation.contact.customFields),
    },
    sessionOpen: conversation.sessionOpenUntil
      ? conversation.sessionOpenUntil > new Date()
      : false,
  });
});

router.post('/conversations/:id/reply', requireAuth, async (req, res) => {
  const { body, mediaUrl } = req.body as { body?: string; mediaUrl?: string };
  if (!body?.trim() && !mediaUrl) {
    return res.status(400).json({ error: 'body or mediaUrl required' });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: { contact: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const sessionOpen = conversation.sessionOpenUntil
    ? conversation.sessionOpenUntil > new Date()
    : false;
  if (!sessionOpen) {
    return res.status(400).json({
      error: '24-hour session window closed. Send a template message via a campaign instead.',
    });
  }

  const config = await getWhatsAppConfig(req.user!.organizationId);
  if (!config) return res.status(400).json({ error: 'WhatsApp not connected' });

  let wamid = '';
  const textBody = body?.trim() || (mediaUrl ? '[Media]' : '');
  if (mediaUrl) {
    const result = await sendMediaMessage(config, conversation.contact.phoneE164, mediaUrl, textBody);
    wamid = result.wamid;
  } else {
    const result = await sendSessionMessage(config, conversation.contact.phoneE164, textBody);
    wamid = result.wamid;
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'Outbound',
      type: mediaUrl ? 'image' : 'text',
      body: textBody,
      mediaUrl: mediaUrl ?? null,
      wamid,
      status: 'Sent',
      sentByUserId: req.user!.userId,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  if (conversation.contact.crmLeadId) {
    const org = await prisma.organization.findUnique({ where: { id: req.user!.organizationId } });
    const { pushCrmComment } = await import('../services/crm/sync.js');
    const prefix = mediaUrl ? '[Outbound media] ' : '[Outbound] ';
    await pushCrmComment(conversation.contact.crmLeadId, `${prefix}${textBody}`, {
      apiUrl: org?.crmApiUrl,
    });
  }

  const { logActivity } = await import('../services/activity/index.js');
  const { adjustEngagementScore } = await import('../services/scoring/index.js');
  const { dispatchWebhooks } = await import('../services/webhooks/outbound.js');
  await logActivity({
    organizationId: req.user!.organizationId,
    contactId: conversation.contact.id,
    channel: mediaUrl ? 'whatsapp' : 'whatsapp',
    direction: 'outbound',
    body: textBody,
    relatedId: message.id,
  });
  await adjustEngagementScore(conversation.contact.id, 'outbound_reply');
  await dispatchWebhooks(req.user!.organizationId, 'message.outbound', {
    contactId: conversation.contact.id,
    conversationId: conversation.id,
    body: textBody,
  });

  const { recordFirstResponse } = await import('../services/sla/index.js');
  await recordFirstResponse(conversation.id, req.user!.userId);

  res.status(201).json(message);
});

router.patch('/conversations/:id/assign', requireAuth, async (req, res) => {
  const { userId } = req.body as { userId?: string | null };
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { assignedUserId: userId ?? null },
    include: { assignedUser: { select: { id: true, fullName: true } } },
  });
  res.json(updated);
});

router.post('/conversations/:id/notes', requireAuth, async (req, res) => {
  const { body } = req.body as { body?: string };
  if (!body?.trim()) return res.status(400).json({ error: 'body required' });

  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const note = await prisma.conversationNote.create({
    data: {
      conversationId: conversation.id,
      userId: req.user!.userId,
      body: body.trim(),
    },
  });
  res.status(201).json(note);
});

router.post('/conversations/:id/resolve', requireAuth, async (req, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: { contact: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const org = await prisma.organization.findUnique({ where: { id: req.user!.organizationId } });
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { resolvedAt: new Date() },
  });

  if (org?.csatEnabled && org.csatPrompt) {
    const config = await getWhatsAppConfig(req.user!.organizationId);
    if (config && conversation.sessionOpenUntil && conversation.sessionOpenUntil > new Date()) {
      const prompt = org.csatPrompt;
      await sendSessionMessage(config, conversation.contact.phoneE164, prompt);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'Outbound',
          type: 'text',
          body: prompt,
          status: 'Sent',
        },
      });
    }
  }

  res.json(updated);
});

router.post('/conversations/:id/csat', requireAuth, async (req, res) => {
  const { score, comment } = req.body as { score?: number; comment?: string };
  if (score == null || score < 1 || score > 5) {
    return res.status(400).json({ error: 'score 1-5 required' });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { csatScore: score, csatComment: comment ?? null },
  });
  res.json(updated);
});

router.patch('/conversations/:id/priority', requireAuth, async (req, res) => {
  const { priority } = req.body as { priority?: string };
  if (!priority) return res.status(400).json({ error: 'priority required' });

  const conversation = await prisma.conversation.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!conversation) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { priority },
  });
  res.json(updated);
});

export default router;
