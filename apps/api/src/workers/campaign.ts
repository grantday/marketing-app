import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { getWhatsAppConfig, sendTemplateMessage } from '../services/whatsapp/index.js';
import { canSendToContact } from '../services/whatsapp/compliance.js';
import { writeAudit } from '../lib/audit.js';
import { parseJsonObject } from '../lib/phone.js';
import { resolveTemplateVariables } from '../lib/variables.js';
import { eventBus } from '../lib/events.js';

function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6380';
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: Number(parsed.port) || 6379,
    maxRetriesPerRequest: null as null,
  };
}

const connection = getRedisConnection();

export const campaignQueue = new Queue('campaign-send', { connection });
export const scheduledCampaignQueue = new Queue('campaign-scheduled', { connection });

export interface CampaignJobData {
  campaignId: string;
  organizationId: string;
}

export async function enqueueCampaign(
  campaignId: string,
  organizationId: string,
  delayMs = 0,
): Promise<void> {
  await campaignQueue.add(
    'send',
    { campaignId, organizationId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      delay: delayMs,
    },
  );
}

async function getCampaignStatus(campaignId: string): Promise<string | null> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  return c?.status ?? null;
}

export function startCampaignWorker(): Worker {
  const worker = new Worker<CampaignJobData>(
    'campaign-send',
    async (job: Job<CampaignJobData>) => {
      await processCampaign(job.data.campaignId, job.data.organizationId);
    },
    {
      connection,
      concurrency: 1,
      limiter: { max: 20, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Campaign job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export function startScheduledCampaignWorker(): Worker {
  const worker = new Worker(
    'campaign-scheduled',
    async () => {
      const due = await prisma.campaign.findMany({
        where: {
          status: 'Scheduled',
          scheduledAt: { lte: new Date() },
        },
        take: 20,
      });
      for (const c of due) {
        const count = await prisma.campaignRecipient.count({ where: { campaignId: c.id } });
        if (count === 0) continue;
        await enqueueCampaign(c.id, c.organizationId);
        await prisma.campaign.update({
          where: { id: c.id },
          data: { status: 'Sending' },
        });
      }
    },
    { connection },
  );
  return worker;
}

async function processCampaign(campaignId: string, organizationId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign) return;

  const status = campaign.status;
  if (status === 'Paused' || status === 'Cancelled') return;

  if (status === 'Scheduled' && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    const delayMs = campaign.scheduledAt.getTime() - Date.now();
    await enqueueCampaign(campaignId, organizationId, delayMs);
    return;
  }

  const config = await getWhatsAppConfig(organizationId);
  if (!config) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'Failed' } });
    return;
  }

  if (campaign.status !== 'Sending') {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'Sending', startedAt: campaign.startedAt ?? new Date() },
    });
  }

  const variableMapping = parseJsonObject(campaign.variableMapping) as Record<string, string>;

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'Queued' },
    include: { contact: true },
    take: 200,
  });

  if (recipients.length === 0) {
    const remaining = await prisma.campaignRecipient.count({ where: { campaignId, status: 'Queued' } });
    if (remaining === 0 && campaign.status !== 'Cancelled' && campaign.status !== 'Paused') {
      const failed = await prisma.campaignRecipient.count({ where: { campaignId, status: 'Failed' } });
      const sent = await prisma.campaignRecipient.count({
        where: { campaignId, status: { in: ['Sent', 'Delivered', 'Read'] } },
      });
      const finalStatus = failed > 0 && sent === 0 ? 'Failed' : 'Completed';
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: finalStatus, completedAt: new Date() },
      });
      const { enqueueAbWinnerCheck } = await import('./enterprise.js');
      await enqueueAbWinnerCheck(campaignId);
      eventBus.emitEvent({ type: 'campaign.updated', campaignId, organizationId });
    }
    return;
  }

  let failed = 0;
  let sent = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const currentStatus = await getCampaignStatus(campaignId);
    if (currentStatus === 'Paused' || currentStatus === 'Cancelled') return;

    const check = await canSendToContact(recipient.contactId, organizationId);
    if (!check.ok) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'Skipped', errorMessage: check.reason },
      });
      skipped++;
      continue;
    }

    const variables = resolveTemplateVariables(recipient.contact, variableMapping);

    const { getTemplateForRecipient } = await import('../services/campaigns/abTest.js');
    const variant = await getTemplateForRecipient(campaignId, recipient.contactId);
    let template = campaign.template;
    if (variant && variant.templateId !== campaign.templateId) {
      const alt = await prisma.messageTemplate.findUnique({ where: { id: variant.templateId } });
      if (alt) template = alt;
    }

    try {
      const { wamid } = await sendTemplateMessage(
        config,
        recipient.contact.phoneE164,
        template.metaName,
        template.language,
        variables,
      );
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'Sent',
          wamid,
          sentAt: new Date(),
          variantLabel: variant?.variantLabel ?? 'A',
        },
      });
      sent++;
      const { recordMessageUsage } = await import('../services/billing/limits.js');
      await recordMessageUsage(organizationId, 1);
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'Failed', errorMessage: message },
      });
      failed++;
    }
  }

  eventBus.emitEvent({ type: 'campaign.updated', campaignId, organizationId });

  const remaining = await prisma.campaignRecipient.count({ where: { campaignId, status: 'Queued' } });
  const currentStatus = await getCampaignStatus(campaignId);

  if (remaining > 0 && currentStatus === 'Sending') {
    await enqueueCampaign(campaignId, organizationId);
    return;
  }

  if (currentStatus === 'Sending') {
    const finalStatus = failed > 0 && sent === 0 ? 'Failed' : 'Completed';
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: finalStatus, completedAt: new Date() },
    });
    await writeAudit(organizationId, 'campaign.completed', {
      entityType: 'Campaign',
      entityId: campaignId,
      details: { sent, failed, skipped },
    });
    const { dispatchWebhooks } = await import('../services/webhooks/outbound.js');
    await dispatchWebhooks(organizationId, 'campaign.completed', {
      campaignId,
      sent,
      failed,
      skipped,
    });
    const { enqueueAbWinnerCheck } = await import('./enterprise.js');
    await enqueueAbWinnerCheck(campaignId);
    eventBus.emitEvent({ type: 'campaign.updated', campaignId, organizationId });
  }
}

export function startTemplateSyncWorker(): Worker {
  const worker = new Worker(
    'template-sync',
    async () => {
      const accounts = await prisma.whatsAppAccount.findMany({ where: { active: true } });
      const { syncTemplatesFromMeta, getWhatsAppConfig } = await import('../services/whatsapp/index.js');
      for (const acc of accounts) {
        const config = await getWhatsAppConfig(acc.organizationId);
        if (config) {
          try {
            await syncTemplatesFromMeta(acc.organizationId, config);
          } catch (e) {
            console.error('Template sync failed:', e);
          }
        }
      }
    },
    { connection },
  );
  return worker;
}

export const templateSyncQueue = new Queue('template-sync', { connection });
export const scheduledPollQueue = new Queue('campaign-scheduled', { connection });

export async function scheduleTemplateSync(): Promise<void> {
  await templateSyncQueue.add('sync', {}, { repeat: { pattern: '0 2 * * *' }, jobId: 'template-sync-daily' });
}

export async function scheduleCampaignPoller(): Promise<void> {
  await scheduledPollQueue.add('poll', {}, { repeat: { every: 60_000 }, jobId: 'campaign-scheduled-poll' });
}
