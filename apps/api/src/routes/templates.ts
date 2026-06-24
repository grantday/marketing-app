import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getWhatsAppConfig, syncTemplatesFromMeta } from '../services/whatsapp/index.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const templates = await prisma.messageTemplate.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { metaName: 'asc' },
  });
  res.json(templates);
});

router.post('/sync', requireAuth, async (req, res) => {
  const config = await getWhatsAppConfig(req.user!.organizationId);
  if (!config) return res.status(400).json({ error: 'WhatsApp not connected' });
  const count = await syncTemplatesFromMeta(req.user!.organizationId, config);
  res.json({ count });
});

router.post('/submit', requireAuth, async (req, res) => {
  const { name, language, category, bodyText } = req.body as {
    name?: string;
    language?: string;
    category?: string;
    bodyText?: string;
  };
  if (!name || !bodyText) {
    return res.status(400).json({ error: 'name and bodyText required' });
  }

  const config = await getWhatsAppConfig(req.user!.organizationId);
  if (!config) return res.status(400).json({ error: 'WhatsApp not connected' });

  const payload = {
    name: name.toLowerCase().replace(/\s+/g, '_'),
    language: language ?? 'en',
    category: category ?? 'MARKETING',
    components: [{ type: 'BODY', text: bodyText }],
  };

  const res2 = await fetch(`${GRAPH}/${config.wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res2.json()) as { id?: string; error?: { message: string } };
  if (!res2.ok) {
    return res.status(400).json({ error: data.error?.message ?? 'Meta template submit failed' });
  }

  await syncTemplatesFromMeta(req.user!.organizationId, config);
  res.status(201).json({ ok: true, metaId: data.id, message: 'Template submitted for Meta review' });
});

export default router;
