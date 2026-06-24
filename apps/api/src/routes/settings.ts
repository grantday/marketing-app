import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const orgSelect = {
  id: true,
  name: true,
  strictOptIn: true,
  businessHoursJson: true,
  autoAssignEnabled: true,
  outsideHoursMessage: true,
  crmApiUrl: true,
  emailFromAddress: true,
  emailProviderJson: true,
  smsProviderJson: true,
  aiEnabled: true,
  aiConfigJson: true,
  slaFirstResponseMinutes: true,
  slaResolutionMinutes: true,
  messageRetentionDays: true,
  csatEnabled: true,
  csatPrompt: true,
} as const;

router.get('/', requireAuth, async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    select: orgSelect,
  });
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.json(org);
});

router.patch('/', requireAuth, requireRole('Admin'), async (req, res) => {
  const {
    strictOptIn,
    businessHoursJson,
    autoAssignEnabled,
    outsideHoursMessage,
    crmApiUrl,
    emailFromAddress,
    emailProviderJson,
    smsProviderJson,
    aiEnabled,
    aiConfigJson,
    slaFirstResponseMinutes,
    slaResolutionMinutes,
    messageRetentionDays,
    csatEnabled,
    csatPrompt,
  } = req.body as {
    strictOptIn?: boolean;
    businessHoursJson?: string | Record<string, unknown>;
    autoAssignEnabled?: boolean;
    outsideHoursMessage?: string | null;
    crmApiUrl?: string | null;
    emailFromAddress?: string | null;
    emailProviderJson?: Record<string, unknown>;
    smsProviderJson?: Record<string, unknown>;
    aiEnabled?: boolean;
    aiConfigJson?: Record<string, unknown>;
    slaFirstResponseMinutes?: number;
    slaResolutionMinutes?: number;
    messageRetentionDays?: number;
    csatEnabled?: boolean;
    csatPrompt?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof strictOptIn === 'boolean') data.strictOptIn = strictOptIn;
  if (typeof autoAssignEnabled === 'boolean') data.autoAssignEnabled = autoAssignEnabled;
  if (outsideHoursMessage !== undefined) data.outsideHoursMessage = outsideHoursMessage;
  if (crmApiUrl !== undefined) data.crmApiUrl = crmApiUrl;
  if (emailFromAddress !== undefined) data.emailFromAddress = emailFromAddress;
  if (emailProviderJson !== undefined) data.emailProviderJson = JSON.stringify(emailProviderJson);
  if (smsProviderJson !== undefined) data.smsProviderJson = JSON.stringify(smsProviderJson);
  if (typeof aiEnabled === 'boolean') data.aiEnabled = aiEnabled;
  if (aiConfigJson !== undefined) data.aiConfigJson = JSON.stringify(aiConfigJson);
  if (typeof slaFirstResponseMinutes === 'number') data.slaFirstResponseMinutes = slaFirstResponseMinutes;
  if (typeof slaResolutionMinutes === 'number') data.slaResolutionMinutes = slaResolutionMinutes;
  if (typeof messageRetentionDays === 'number') data.messageRetentionDays = messageRetentionDays;
  if (typeof csatEnabled === 'boolean') data.csatEnabled = csatEnabled;
  if (csatPrompt !== undefined) data.csatPrompt = csatPrompt;
  if (businessHoursJson !== undefined) {
    data.businessHoursJson =
      typeof businessHoursJson === 'string' ? businessHoursJson : JSON.stringify(businessHoursJson);
  }

  const org = await prisma.organization.update({
    where: { id: req.user!.organizationId },
    data,
    select: orgSelect,
  });
  res.json(org);
});

export default router;
