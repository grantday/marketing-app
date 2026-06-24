import { Queue, Worker } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { parseJsonObject } from '../lib/phone.js';
import { sendEmail } from '../services/email/index.js';
import { sendSms, isSmsCapablePhone } from '../services/sms/index.js';
import { logActivity } from '../services/activity/index.js';
import { connection } from '../lib/workflow/queue.js';

export const crossChannelQueue = new Queue('cross-channel', { connection });

interface ChannelStrategy {
  primary?: string;
  fallback?: {
    channel?: 'email' | 'sms';
    afterHours?: number;
    emailSubject?: string;
    emailBody?: string;
    smsBody?: string;
  };
}

export function startCrossChannelWorker(): Worker {
  const worker = new Worker(
    'cross-channel',
    async () => {
      await processCrossChannelFallbacks();
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (_job, err) => console.error('Cross-channel job failed:', err.message));
  return worker;
}

export async function scheduleCrossChannelPoller(): Promise<void> {
  await crossChannelQueue.add(
    'poll',
    {},
    { repeat: { every: 15 * 60_000 }, jobId: 'cross-channel-poller' },
  );
}

async function processCrossChannelFallbacks(): Promise<void> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['Sending', 'Completed'] } },
    take: 50,
  });

  for (const campaign of campaigns) {
    const strategy = parseJsonObject(campaign.channelStrategy) as ChannelStrategy;
    const fallback = strategy.fallback;
    if (!fallback?.channel) continue;

    const afterHours = fallback.afterHours ?? 48;
    const cutoff = new Date(Date.now() - afterHours * 3600000);

    const recipients = await prisma.campaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ['Sent', 'Delivered'] },
        readAt: null,
        sentAt: { lte: cutoff },
        emailSentAt: null,
        smsSentAt: null,
      },
      include: { contact: true },
      take: 100,
    });

    for (const r of recipients) {
      if (fallback.channel === 'email' && r.contact.email) {
        try {
          const subject = fallback.emailSubject ?? `Follow-up: ${campaign.name}`;
          const body =
            fallback.emailBody ??
            `<p>Hi ${r.contact.name ?? 'there'},</p><p>We tried reaching you on WhatsApp. Please get in touch when you can.</p>`;
          await sendEmail(campaign.organizationId, r.contact.email, subject, body);
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { emailSentAt: new Date(), fallbackChannel: 'email' },
          });
          await logActivity({
            organizationId: campaign.organizationId,
            contactId: r.contact.id,
            channel: 'email',
            direction: 'outbound',
            body: subject,
            metadata: { campaignId: campaign.id, type: 'fallback' },
            relatedId: r.id,
          });
        } catch (e) {
          console.error('Email fallback failed:', e);
        }
      } else if (fallback.channel === 'sms' && isSmsCapablePhone(r.contact.phoneE164)) {
        try {
          const body = fallback.smsBody ?? `We tried WhatsApp — reply or call us. (${campaign.name})`;
          await sendSms(campaign.organizationId, r.contact.phoneE164, body);
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { smsSentAt: new Date(), fallbackChannel: 'sms' },
          });
          await logActivity({
            organizationId: campaign.organizationId,
            contactId: r.contact.id,
            channel: 'sms',
            direction: 'outbound',
            body,
            metadata: { campaignId: campaign.id, type: 'fallback' },
            relatedId: r.id,
          });
        } catch (e) {
          console.error('SMS fallback failed:', e);
        }
      }
    }
  }
}
