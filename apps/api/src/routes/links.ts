import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { createTrackedLink } from '../services/links/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const links = await prisma.trackedLink.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const base = process.env.LINK_BASE_URL || 'http://localhost:3002';
  res.json(links.map((l) => ({ ...l, shortUrl: `${base}/l/${l.code}` })));
});

router.post('/', requireAuth, async (req, res) => {
  const { destinationUrl, title } = req.body as { destinationUrl?: string; title?: string };
  if (!destinationUrl) return res.status(400).json({ error: 'destinationUrl required' });

  const link = await createTrackedLink(req.user!.organizationId, destinationUrl, title);
  res.status(201).json(link);
});

router.get('/:id/stats', requireAuth, async (req, res) => {
  const link = await prisma.trackedLink.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: { _count: { select: { clicks: true } } },
  });
  if (!link) return res.status(404).json({ error: 'Not found' });

  const recent = await prisma.linkClick.findMany({
    where: { trackedLinkId: link.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({ ...link, totalClicks: link._count.clicks, recentClicks: recent });
});

export default router;
