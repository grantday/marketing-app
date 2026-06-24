import { prisma } from '../../lib/prisma.js';

const SCORE = {
  inbound_message: 5,
  outbound_reply: 2,
  campaign_read: 10,
  campaign_delivered: 5,
  campaign_sent: 1,
  opt_out: -50,
  email_open: 3,
  sms_reply: 4,
} as const;

export type ScoreEvent = keyof typeof SCORE;

export async function adjustEngagementScore(
  contactId: string,
  event: ScoreEvent,
): Promise<void> {
  const delta = SCORE[event] ?? 0;
  if (!delta) return;

  await prisma.contact.update({
    where: { id: contactId },
    data: { engagementScore: { increment: delta } },
  });
}

export async function recalculateEngagementScore(contactId: string): Promise<number> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      conversations: { include: { messages: true } },
      campaignRecipients: true,
    },
  });
  if (!contact) return 0;

  let score = 0;
  if (contact.optInStatus === 'OptedOut') score -= 50;

  for (const convo of contact.conversations) {
    for (const m of convo.messages) {
      if (m.direction === 'Inbound') score += 5;
      else score += 2;
    }
  }

  for (const r of contact.campaignRecipients) {
    if (r.readAt) score += 10;
    else if (r.deliveredAt) score += 5;
    else if (r.sentAt) score += 1;
    if (r.emailSentAt) score += 3;
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: { engagementScore: score },
  });
  return score;
}
