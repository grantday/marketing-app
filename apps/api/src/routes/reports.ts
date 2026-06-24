import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSlaReport, slaReportToCsv } from '../services/sla/index.js';
import { getAiMetrics } from '../services/ai/index.js';
import { exportMessagesForLegal } from '../services/retention/index.js';

const router = Router();

router.get('/sla', requireAuth, async (req, res) => {
  const report = await getSlaReport(req.user!.organizationId);
  res.json(report);
});

router.get('/sla/export', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {
  const report = await getSlaReport(req.user!.organizationId);
  const csv = slaReportToCsv(report);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reach-sla-report.csv"');
  res.send(csv);
});

router.get('/compliance', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId;
  const since = new Date(Date.now() - 30 * 86400000);

  const [total, optedIn, optedOut, unknown, complaints, optOuts] = await Promise.all([
    prisma.contact.count({ where: { organizationId: orgId } }),
    prisma.contact.count({ where: { organizationId: orgId, optInStatus: 'OptedIn' } }),
    prisma.contact.count({ where: { organizationId: orgId, optInStatus: 'OptedOut' } }),
    prisma.contact.count({ where: { organizationId: orgId, optInStatus: 'Unknown' } }),
    prisma.complaintLog.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.auditLog.count({
      where: { organizationId: orgId, action: 'contact.opt_out', createdAt: { gte: since } },
    }),
  ]);

  const wa = await prisma.whatsAppAccount.findFirst({
    where: { organizationId: orgId, isPrimary: true },
  });

  const checklist = [
    { item: 'Webhook verified', ok: wa?.webhookVerified ?? false },
    { item: 'Strict opt-in enabled', ok: (await prisma.organization.findUnique({ where: { id: orgId } }))?.strictOptIn ?? false },
    { item: 'WhatsApp connected', ok: !!wa?.active },
    { item: 'Opt-out rate under 5%', ok: total > 0 ? optedOut / total < 0.05 : true },
    { item: 'Unknown contacts under 20%', ok: total > 0 ? unknown / total < 0.2 : true },
  ];

  res.json({
    contacts: { total, optedIn, optedOut, unknown, optInRate: total > 0 ? Math.round((optedIn / total) * 100) : 0 },
    complaints,
    optOutsLast30d: optOuts,
    metaChecklist: checklist,
    ai: await getAiMetrics(orgId),
  });
});

router.post('/complaints', requireAuth, async (req, res) => {
  const { contactId, message, source } = req.body as { contactId?: string; message?: string; source?: string };
  if (!message) return res.status(400).json({ error: 'message required' });

  const log = await prisma.complaintLog.create({
    data: {
      organizationId: req.user!.organizationId,
      contactId: contactId ?? null,
      message,
      source: source ?? 'manual',
    },
  });
  res.status(201).json(log);
});

router.get('/messages/export', requireAuth, requireRole('Admin'), async (req, res) => {
  const csv = await exportMessagesForLegal(req.user!.organizationId);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reach-messages-export.csv"');
  res.send(csv);
});

export default router;
