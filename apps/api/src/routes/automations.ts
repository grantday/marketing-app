import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// --- Canned replies ---

router.get('/canned-replies', requireAuth, async (req, res) => {
  const items = await prisma.cannedReply.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { title: 'asc' },
  });
  res.json(items);
});

router.post('/canned-replies', requireAuth, async (req, res) => {
  const { title, body, shortcut } = req.body as { title?: string; body?: string; shortcut?: string };
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  const item = await prisma.cannedReply.create({
    data: {
      organizationId: req.user!.organizationId,
      title,
      body,
      shortcut: shortcut ?? null,
    },
  });
  res.status(201).json(item);
});

router.patch('/canned-replies/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.cannedReply.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { title, body, shortcut } = req.body as { title?: string; body?: string; shortcut?: string };
  const item = await prisma.cannedReply.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(shortcut !== undefined ? { shortcut } : {}),
    },
  });
  res.json(item);
});

router.delete('/canned-replies/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.cannedReply.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.cannedReply.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// --- Chatbot rules ---

router.get('/chatbot-rules', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const rules = await prisma.chatbotRule.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: [{ priority: 'desc' }, { name: 'asc' }],
  });
  res.json(rules);
});

router.post('/chatbot-rules', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const { name, keyword, matchType, responseBody, menuOptions, priority, handoffAfter, active } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    responseBody?: string;
    menuOptions?: { label: string; reply: string }[];
    priority?: number;
    handoffAfter?: boolean;
    active?: boolean;
  };
  if (!name || !keyword || !responseBody) {
    return res.status(400).json({ error: 'name, keyword, responseBody required' });
  }

  const rule = await prisma.chatbotRule.create({
    data: {
      organizationId: req.user!.organizationId,
      name,
      keyword,
      matchType: matchType ?? 'contains',
      responseBody,
      menuOptionsJson: JSON.stringify(menuOptions ?? []),
      priority: priority ?? 0,
      handoffAfter: handoffAfter ?? false,
      active: active ?? true,
    },
  });
  res.status(201).json(rule);
});

router.patch('/chatbot-rules/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.chatbotRule.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, keyword, matchType, responseBody, menuOptions, priority, handoffAfter, active } = req.body as {
    name?: string;
    keyword?: string;
    matchType?: string;
    responseBody?: string;
    menuOptions?: { label: string; reply: string }[];
    priority?: number;
    handoffAfter?: boolean;
    active?: boolean;
  };

  const rule = await prisma.chatbotRule.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(keyword !== undefined ? { keyword } : {}),
      ...(matchType !== undefined ? { matchType } : {}),
      ...(responseBody !== undefined ? { responseBody } : {}),
      ...(menuOptions !== undefined ? { menuOptionsJson: JSON.stringify(menuOptions) } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(handoffAfter !== undefined ? { handoffAfter } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  res.json(rule);
});

router.delete('/chatbot-rules/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.chatbotRule.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.chatbotRule.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
