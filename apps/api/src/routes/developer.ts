import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateApiKey } from '../lib/apiKey.js';
import { parseJsonArray } from '../lib/phone.js';
import crypto from 'crypto';

const router = Router();

router.get('/api-keys', requireAuth, requireRole('Admin'), async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      active: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  res.json(keys.map((k) => ({ ...k, scopes: parseJsonArray(k.scopes) })));
});

router.post('/api-keys', requireAuth, requireRole('Admin'), async (req, res) => {
  const { name, scopes } = req.body as { name?: string; scopes?: string[] };
  if (!name) return res.status(400).json({ error: 'name required' });

  const { fullKey, prefix, hash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      organizationId: req.user!.organizationId,
      name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: JSON.stringify(scopes ?? ['read', 'write']),
    },
  });

  res.status(201).json({
    id: key.id,
    name: key.name,
    key: fullKey,
    keyPrefix: prefix,
    message: 'Copy this key now — it will not be shown again.',
  });
});

router.delete('/api-keys/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const existing = await prisma.apiKey.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.apiKey.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.get('/webhooks', requireAuth, requireRole('Admin'), async (req, res) => {
  const hooks = await prisma.outboundWebhook.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { deliveries: true } } },
  });
  res.json(
    hooks.map((h) => ({
      ...h,
      events: parseJsonArray(h.events),
      secret: h.secret ? '••••••••' : null,
    })),
  );
});

router.post('/webhooks', requireAuth, requireRole('Admin'), async (req, res) => {
  const { name, url, events, secret } = req.body as {
    name?: string;
    url?: string;
    events?: string[];
    secret?: string;
  };
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });

  const hook = await prisma.outboundWebhook.create({
    data: {
      organizationId: req.user!.organizationId,
      name,
      url,
      events: JSON.stringify(events ?? ['*']),
      secret: secret ?? crypto.randomBytes(16).toString('hex'),
    },
  });
  res.status(201).json({ ...hook, events: parseJsonArray(hook.events) });
});

router.patch('/webhooks/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const existing = await prisma.outboundWebhook.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, url, events, active } = req.body as {
    name?: string;
    url?: string;
    events?: string[];
    active?: boolean;
  };

  const hook = await prisma.outboundWebhook.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(events !== undefined ? { events: JSON.stringify(events) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  res.json({ ...hook, events: parseJsonArray(hook.events) });
});

router.delete('/webhooks/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const existing = await prisma.outboundWebhook.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.outboundWebhook.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.get('/webhooks/:id/deliveries', requireAuth, requireRole('Admin'), async (req, res) => {
  const hook = await prisma.outboundWebhook.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!hook) return res.status(404).json({ error: 'Not found' });

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: hook.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(deliveries);
});

export default router;
