import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enrollContact } from '../services/workflow/engine.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId: req.user!.organizationId, isTemplate: false },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { enrollments: true } } },
  });
  res.json(workflows);
});

router.get('/templates', requireAuth, async (req, res) => {
  const templates = await prisma.workflow.findMany({
    where: { organizationId: req.user!.organizationId, isTemplate: true },
    orderBy: { name: 'asc' },
  });
  res.json(templates);
});

router.get('/:id', requireAuth, async (req, res) => {
  const wf = await prisma.workflow.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    include: {
      enrollments: {
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: { contact: { select: { id: true, name: true, phoneE164: true } } },
      },
    },
  });
  if (!wf) return res.status(404).json({ error: 'Not found' });
  res.json(wf);
});

router.post('/', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const { name, description, triggerType, triggerConfig, stepsJson, active, fromTemplateId } = req.body as {
    name?: string;
    description?: string;
    triggerType?: string;
    triggerConfig?: Record<string, string>;
    stepsJson?: unknown[];
    active?: boolean;
    fromTemplateId?: string;
  };

  if (fromTemplateId) {
    const tpl = await prisma.workflow.findFirst({
      where: { id: fromTemplateId, organizationId: req.user!.organizationId, isTemplate: true },
    });
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const wf = await prisma.workflow.create({
      data: {
        organizationId: req.user!.organizationId,
        name: name || tpl.name,
        description: tpl.description,
        triggerType: triggerType || tpl.triggerType,
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : tpl.triggerConfig,
        stepsJson: tpl.stepsJson,
        active: active ?? true,
      },
    });
    return res.status(201).json(wf);
  }

  if (!name || !triggerType) {
    return res.status(400).json({ error: 'name and triggerType required' });
  }

  const wf = await prisma.workflow.create({
    data: {
      organizationId: req.user!.organizationId,
      name,
      description: description ?? null,
      triggerType,
      triggerConfig: JSON.stringify(triggerConfig ?? {}),
      stepsJson: JSON.stringify(stepsJson ?? []),
      active: active ?? true,
    },
  });
  res.status(201).json(wf);
});

router.patch('/:id', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const existing = await prisma.workflow.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId, isTemplate: false },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, description, triggerType, triggerConfig, stepsJson, active } = req.body as {
    name?: string;
    description?: string;
    triggerType?: string;
    triggerConfig?: Record<string, string>;
    stepsJson?: unknown[];
    active?: boolean;
  };

  const wf = await prisma.workflow.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(triggerType !== undefined ? { triggerType } : {}),
      ...(triggerConfig !== undefined ? { triggerConfig: JSON.stringify(triggerConfig) } : {}),
      ...(stepsJson !== undefined ? { stepsJson: JSON.stringify(stepsJson) } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  res.json(wf);
});

router.delete('/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const existing = await prisma.workflow.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId, isTemplate: false },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await prisma.workflow.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

router.post('/:id/enroll', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const { contactId } = req.body as { contactId?: string };
  if (!contactId) return res.status(400).json({ error: 'contactId required' });

  const wf = await prisma.workflow.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!wf) return res.status(404).json({ error: 'Not found' });

  await enrollContact(wf.id, contactId);
  res.json({ ok: true });
});

export default router;
