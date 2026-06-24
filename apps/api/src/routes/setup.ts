import { Router } from 'express';

import { whatsappSetupSchema, whatsappUpdateSchema } from '@reach/shared';

import { prisma } from '../lib/prisma.js';

import { encryptToken } from '../lib/crypto.js';

import { requireAuth, requireRole } from '../middleware/auth.js';

import {

  getWhatsAppConfig,

  sendSessionMessage,

  syncTemplatesFromMeta,

} from '../services/whatsapp/index.js';

import { writeAudit } from '../lib/audit.js';



const router = Router();



function formatAccount(account: {

  id: string;

  label: string;

  isPrimary: boolean;

  phoneNumberId: string;

  wabaId: string;

  displayPhone: string | null;

  webhookVerified: boolean;

  active: boolean;

}) {

  return {

    id: account.id,

    label: account.label,

    isPrimary: account.isPrimary,

    phoneNumberId: account.phoneNumberId,

    wabaId: account.wabaId,

    displayPhone: account.displayPhone,

    webhookVerified: account.webhookVerified,

    active: account.active,

    connected: true,

  };

}



router.get('/whatsapp', requireAuth, async (req, res) => {

  const accounts = await prisma.whatsAppAccount.findMany({

    where: { organizationId: req.user!.organizationId, active: true },

    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],

  });

  const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];

  if (!primary) {

    return res.json({ connected: false, accounts: [], webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'reach-webhook-verify' });

  }

  res.json({

    ...formatAccount(primary),

    accounts: accounts.map(formatAccount),

    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'reach-webhook-verify',

    webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/whatsapp`,

  });

});



router.post('/whatsapp', requireAuth, requireRole('Admin'), async (req, res) => {

  const orgId = req.user!.organizationId;

  const { label, isPrimary } = req.body as { label?: string; isPrimary?: boolean };



  const existing = await prisma.whatsAppAccount.findFirst({

    where: { organizationId: orgId, isPrimary: true },

  });



  const parsed = existing

    ? whatsappUpdateSchema.safeParse(req.body)

    : whatsappSetupSchema.safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });



  const tokenRaw = parsed.data.accessToken?.trim() ?? '';

  let accessTokenEnc: string;

  const matchExisting = await prisma.whatsAppAccount.findUnique({

    where: {

      organizationId_phoneNumberId: {

        organizationId: orgId,

        phoneNumberId: parsed.data.phoneNumberId,

      },

    },

  });



  if (tokenRaw.length >= 10) {

    accessTokenEnc = encryptToken(tokenRaw);

  } else if (matchExisting) {

    accessTokenEnc = matchExisting.accessTokenEnc;

  } else if (existing) {

    accessTokenEnc = existing.accessTokenEnc;

  } else {

    return res.status(400).json({ error: 'Access token is required for first-time setup' });

  }



  const phoneChanged = matchExisting != null && matchExisting.phoneNumberId !== parsed.data.phoneNumberId;

  const wabaChanged = matchExisting != null && matchExisting.wabaId !== parsed.data.wabaId;



  if (isPrimary) {

    await prisma.whatsAppAccount.updateMany({

      where: { organizationId: orgId },

      data: { isPrimary: false },

    });

  }



  const account = await prisma.whatsAppAccount.upsert({

    where: {

      organizationId_phoneNumberId: {

        organizationId: orgId,

        phoneNumberId: parsed.data.phoneNumberId,

      },

    },

    create: {

      organizationId: orgId,

      label: label ?? 'Primary',

      isPrimary: isPrimary ?? !existing,

      accessTokenEnc,

      phoneNumberId: parsed.data.phoneNumberId,

      wabaId: parsed.data.wabaId,

      displayPhone: parsed.data.displayPhone,

    },

    update: {

      accessTokenEnc,

      wabaId: parsed.data.wabaId,

      displayPhone: parsed.data.displayPhone,

      label: label ?? undefined,

      isPrimary: isPrimary ?? undefined,

      active: true,

      webhookVerified: phoneChanged || wabaChanged ? false : undefined,

    },

  });



  await writeAudit(orgId, phoneChanged ? 'whatsapp.number_changed' : 'whatsapp.connected', {

    userId: req.user!.userId,

    entityType: 'WhatsAppAccount',

    entityId: account.id,

    details: phoneChanged

      ? {

          previousPhoneNumberId: matchExisting!.phoneNumberId,

          newPhoneNumberId: parsed.data.phoneNumberId,

        }

      : {},

  });



  try {

    const config = await getWhatsAppConfig(orgId, account.phoneNumberId);

    if (config) await syncTemplatesFromMeta(orgId, config);

  } catch (e) {

    console.warn('Initial template sync failed:', e);

  }



  res.json(formatAccount(account));

});



router.post('/whatsapp/test', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {

  const { to, message } = req.body as { to?: string; message?: string };

  if (!to) return res.status(400).json({ error: 'to phone required' });



  const config = await getWhatsAppConfig(req.user!.organizationId);

  if (!config) return res.status(400).json({ error: 'WhatsApp not connected' });



  try {

    const result = await sendSessionMessage(config, to, message || 'Reach test message');

    res.json({ ok: true, wamid: result.wamid });

  } catch (e) {

    res.status(400).json({ error: e instanceof Error ? e.message : 'Send failed' });

  }

});



router.post('/whatsapp/sync-templates', requireAuth, requireRole('Admin', 'Marketer'), async (req, res) => {

  const config = await getWhatsAppConfig(req.user!.organizationId);

  if (!config) return res.status(400).json({ error: 'WhatsApp not connected' });

  try {

    const count = await syncTemplatesFromMeta(req.user!.organizationId, config);

    res.json({ ok: true, count });

  } catch (e) {

    res.status(400).json({ error: e instanceof Error ? e.message : 'Sync failed' });

  }

});



router.post('/whatsapp/verify-webhook', requireAuth, requireRole('Admin'), async (req, res) => {

  await prisma.whatsAppAccount.updateMany({

    where: { organizationId: req.user!.organizationId, isPrimary: true },

    data: { webhookVerified: true },

  });

  res.json({ ok: true });

});

router.get('/meta/embedded-config', requireAuth, requireRole('Admin'), (_req, res) => {
  const appId = process.env.META_APP_ID ?? '';
  const configId = process.env.META_EMBEDDED_CONFIG_ID ?? '';
  res.json({
    appId,
    configId,
    configured: !!(appId && configId),
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/embedded-signup',
    fallbackManual: true,
  });
});

export default router;

