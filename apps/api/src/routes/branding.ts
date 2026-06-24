import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseJsonObject } from '../lib/phone.js';
import { slugify } from '../lib/slug.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    select: {
      name: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      whiteLabelJson: true,
      resellerParentId: true,
    },
  });
  if (!org) return res.status(404).json({ error: 'Not found' });

  res.json({
    ...org,
    whiteLabel: parseJsonObject(org.whiteLabelJson),
  });
});

router.patch('/', requireAuth, requireRole('Admin'), async (req, res) => {
  const {
    subdomain,
    customDomain,
    whiteLabel,
    resellerMode,
  } = req.body as {
    subdomain?: string | null;
    customDomain?: string | null;
    whiteLabel?: Record<string, unknown>;
    resellerMode?: boolean;
  };

  const orgId = req.user!.organizationId;
  const data: Record<string, unknown> = {};

  if (whiteLabel !== undefined) {
    data.whiteLabelJson = JSON.stringify(whiteLabel);
  }

  if (subdomain !== undefined) {
    const clean = subdomain ? slugify(subdomain) : null;
    if (clean) {
      const taken = await prisma.organization.findFirst({
        where: { subdomain: clean, NOT: { id: orgId } },
      });
      if (taken) return res.status(409).json({ error: 'Subdomain already taken' });
    }
    data.subdomain = clean;
  }

  if (customDomain !== undefined) {
    const domain = customDomain?.trim().toLowerCase() || null;
    if (domain) {
      const taken = await prisma.organization.findFirst({
        where: { customDomain: domain, NOT: { id: orgId } },
      });
      if (taken) return res.status(409).json({ error: 'Custom domain already registered' });
    }
    data.customDomain = domain;
  }

  if (typeof resellerMode === 'boolean') {
    data.whiteLabelJson = JSON.stringify({
      ...parseJsonObject((await prisma.organization.findUnique({ where: { id: orgId } }))?.whiteLabelJson ?? '{}'),
      resellerMode,
      hidePoweredBy: resellerMode,
    });
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data,
    select: { name: true, slug: true, subdomain: true, customDomain: true, whiteLabelJson: true },
  });

  res.json({ ...org, whiteLabel: parseJsonObject(org.whiteLabelJson) });
});

/** Public branding lookup by subdomain (for custom domain routing in Phase 7). */
router.get('/by-subdomain/:subdomain', async (req, res) => {
  const org = await prisma.organization.findFirst({
    where: { subdomain: slugify(String(req.params.subdomain)) },
    select: { name: true, whiteLabelJson: true },
  });
  if (!org) return res.status(404).json({ error: 'Not found' });
  res.json({ name: org.name, whiteLabel: parseJsonObject(org.whiteLabelJson) });
});

export default router;
