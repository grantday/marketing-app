import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId;

  const [
    contactCount,
    optedInCount,
    optedOutCount,
    activeCampaigns,
    unreadConversations,
    recentCampaigns,
    waAccount,
  ] = await Promise.all([
    prisma.contact.count({ where: { organizationId: orgId } }),
    prisma.contact.count({ where: { organizationId: orgId, optInStatus: 'OptedIn' } }),
    prisma.contact.count({ where: { organizationId: orgId, optInStatus: 'OptedOut' } }),
    prisma.campaign.count({
      where: { organizationId: orgId, status: { in: ['Sending', 'Scheduled'] } },
    }),
    prisma.conversation.count({
      where: { organizationId: orgId, unreadCount: { gt: 0 } },
    }),
    prisma.campaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { template: true },
    }),
    prisma.whatsAppAccount.findFirst({ where: { organizationId: orgId, isPrimary: true } }),
  ]);

  const completedCampaigns = await prisma.campaign.findMany({
    where: { organizationId: orgId, status: 'Completed' },
    include: { recipients: true },
    take: 10,
  });

  let totalSent = 0;
  let totalDelivered = 0;
  let totalRead = 0;
  for (const c of completedCampaigns) {
    for (const r of c.recipients) {
      if (['Sent', 'Delivered', 'Read'].includes(r.status)) totalSent++;
      if (['Delivered', 'Read'].includes(r.status)) totalDelivered++;
      if (r.status === 'Read') totalRead++;
    }
  }

  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
  const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

  res.json({
    contacts: { total: contactCount, optedIn: optedInCount, optedOut: optedOutCount },
    campaigns: { active: activeCampaigns, recent: recentCampaigns },
    inbox: { unread: unreadConversations },
    performance: { totalSent, deliveryRate, readRate },
    whatsapp: {
      connected: !!waAccount?.active,
      webhookVerified: waAccount?.webhookVerified ?? false,
    },
  });
});

router.get('/templates', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId;
  const templates = await prisma.messageTemplate.findMany({
    where: { organizationId: orgId },
    include: { campaigns: { include: { recipients: true } } },
  });

  const stats = templates.map((t) => {
    let sent = 0;
    let read = 0;
    for (const c of t.campaigns) {
      for (const r of c.recipients) {
        if (['Sent', 'Delivered', 'Read'].includes(r.status)) sent++;
        if (r.status === 'Read') read++;
      }
    }
    return {
      id: t.id,
      metaName: t.metaName,
      language: t.language,
      status: t.status,
      category: t.category,
      campaigns: t.campaigns.length,
      sent,
      readRate: sent > 0 ? Math.round((read / sent) * 100) : 0,
    };
  });

  res.json(stats);
});

router.get('/audit', requireAuth, async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;
