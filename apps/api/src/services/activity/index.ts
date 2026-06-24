import { prisma } from '../../lib/prisma.js';
import { stringifyJson } from '../../lib/phone.js';

export interface ActivityInput {
  organizationId: string;
  contactId: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'campaign' | 'system';
  direction: 'inbound' | 'outbound';
  body: string;
  metadata?: Record<string, unknown>;
  relatedId?: string;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  await prisma.contactActivity.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      channel: input.channel,
      direction: input.direction,
      body: input.body.slice(0, 4000),
      metadata: stringifyJson(input.metadata ?? {}),
      relatedId: input.relatedId ?? null,
    },
  });
}

export async function getContactTimeline(contactId: string, organizationId: string, limit = 100) {
  return prisma.contactActivity.findMany({
    where: { contactId, organizationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function buildUnifiedTimeline(contactId: string, organizationId: string) {
  const [activities, messages, recipients] = await Promise.all([
    prisma.contactActivity.findMany({
      where: { contactId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.message.findMany({
      where: { conversation: { contactId, organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { conversation: { select: { id: true } } },
    }),
    prisma.campaignRecipient.findMany({
      where: { contactId, campaign: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { campaign: { select: { id: true, name: true } } },
    }),
  ]);

  type TimelineItem = {
    id: string;
    channel: string;
    direction: string;
    body: string;
    createdAt: Date;
    metadata: Record<string, unknown>;
  };

  const items: TimelineItem[] = [];

  for (const a of activities) {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(a.metadata) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    items.push({
      id: a.id,
      channel: a.channel,
      direction: a.direction,
      body: a.body,
      createdAt: a.createdAt,
      metadata,
    });
  }

  for (const m of messages) {
    const exists = items.some((i) => i.metadata.messageId === m.id);
    if (exists) continue;
    items.push({
      id: `msg-${m.id}`,
      channel: 'whatsapp',
      direction: m.direction.toLowerCase(),
      body: m.body,
      createdAt: m.createdAt,
      metadata: { messageId: m.id, conversationId: m.conversation.id, status: m.status, mediaUrl: m.mediaUrl },
    });
  }

  for (const r of recipients) {
    items.push({
      id: `camp-${r.id}`,
      channel: 'campaign',
      direction: 'outbound',
      body: `Campaign: ${r.campaign.name} — ${r.status}`,
      createdAt: r.sentAt ?? r.createdAt,
      metadata: {
        campaignId: r.campaign.id,
        status: r.status,
        fallbackChannel: r.fallbackChannel,
        emailSentAt: r.emailSentAt,
      },
    });
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items.slice(0, 200);
}
