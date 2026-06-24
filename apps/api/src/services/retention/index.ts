import { prisma } from '../../lib/prisma.js';

export async function purgeExpiredMessages(): Promise<number> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, messageRetentionDays: true },
  });

  let deleted = 0;
  for (const org of orgs) {
    const days = org.messageRetentionDays ?? 365;
    const cutoff = new Date(Date.now() - days * 86400000);

    const convos = await prisma.conversation.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    });
    const convoIds = convos.map((c) => c.id);
    if (!convoIds.length) continue;

    const result = await prisma.message.deleteMany({
      where: { conversationId: { in: convoIds }, createdAt: { lt: cutoff } },
    });
    deleted += result.count;
  }
  return deleted;
}

export async function exportMessagesForLegal(organizationId: string): Promise<string> {
  const messages = await prisma.message.findMany({
    where: { conversation: { organizationId } },
    include: {
      conversation: { include: { contact: { select: { phoneE164: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
    take: 10000,
  });

  const header = 'timestamp,phone,name,direction,body,status';
  const rows = messages.map((m) => {
    const cols = [
      m.createdAt.toISOString(),
      m.conversation.contact.phoneE164,
      m.conversation.contact.name ?? '',
      m.direction,
      m.body.replace(/"/g, '""'),
      m.status,
    ];
    return cols.map((c) => `"${c}"`).join(',');
  });

  return [header, ...rows].join('\n');
}
