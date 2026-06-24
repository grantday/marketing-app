import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireApiKey, requireScope } from '../../middleware/apiKey.js';
import { enqueueCampaign } from '../../workers/campaign.js';

const router = Router();

/** Zapier polling trigger: new inbound messages since cursor */
router.get('/triggers/inbound-message', requireApiKey, requireScope('read'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const since = req.query.since
    ? new Date(String(req.query.since))
    : new Date(Date.now() - 5 * 60_000);

  const messages = await prisma.message.findMany({
    where: {
      direction: 'Inbound',
      createdAt: { gt: since },
      conversation: { organizationId: orgId },
    },
    include: {
      conversation: { include: { contact: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  res.json(
    messages.map((m) => ({
      id: m.id,
      message: m.body,
      phone: m.conversation.contact.phoneE164,
      contactName: m.conversation.contact.name,
      contactId: m.conversation.contact.id,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

/** Zapier action: create contact */
router.post('/actions/create-contact', requireApiKey, requireScope('write'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const { phone, name, email } = req.body as { phone?: string; name?: string; email?: string };
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const phoneE164 = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
  const contact = await prisma.contact.upsert({
    where: { organizationId_phoneE164: { organizationId: orgId, phoneE164 } },
    create: {
      organizationId: orgId,
      phoneE164,
      name: name ?? null,
      email: email ?? null,
      source: 'zapier',
    },
    update: { name: name ?? undefined, email: email ?? undefined },
  });

  res.json({ id: contact.id, phone: contact.phoneE164, name: contact.name });
});

/** Zapier action: send campaign by ID (must be prepared) */
router.post('/actions/start-campaign', requireApiKey, requireScope('write'), async (req, res) => {
  const orgId = req.apiKey!.organizationId;
  const { campaignId } = req.body as { campaignId?: string };
  if (!campaignId) return res.status(400).json({ error: 'campaignId required' });

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: orgId },
  });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const count = await prisma.campaignRecipient.count({ where: { campaignId } });
  if (count === 0) return res.status(400).json({ error: 'Prepare campaign recipients first' });

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'Sending' } });
  await enqueueCampaign(campaignId, orgId);
  res.json({ ok: true, campaignId, status: 'Sending' });
});

/** Make.com compatible subscribe test */
router.get('/auth/test', requireApiKey, async (req, res) => {
  res.json({ ok: true, organizationId: req.apiKey!.organizationId });
});

export default router;
