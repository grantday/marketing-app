import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseJsonArray, stringifyJson } from '../lib/phone.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const articles = await prisma.knowledgeArticle.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(articles.map((a) => ({ ...a, tags: parseJsonArray(a.tags) })));
});

router.post('/', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const { title, content, tags, active } = req.body as {
    title?: string;
    content?: string;
    tags?: string[];
    active?: boolean;
  };
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });

  const article = await prisma.knowledgeArticle.create({
    data: {
      organizationId: req.user!.organizationId,
      title,
      content,
      tags: stringifyJson(tags ?? []),
      active: active ?? true,
    },
  });
  res.status(201).json({ ...article, tags: parseJsonArray(article.tags) });
});

router.patch('/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { title, content, tags, active } = req.body as {
    title?: string;
    content?: string;
    tags?: string[];
    active?: boolean;
  };

  const article = await prisma.knowledgeArticle.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(tags !== undefined ? { tags: stringifyJson(tags) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  res.json({ ...article, tags: parseJsonArray(article.tags) });
});

router.delete('/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.knowledgeArticle.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
