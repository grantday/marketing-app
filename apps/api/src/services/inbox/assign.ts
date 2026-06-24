import { prisma } from '../../lib/prisma.js';

export async function assignRoundRobin(organizationId: string, conversationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org?.autoAssignEnabled) return;

  const agents = await prisma.user.findMany({
    where: { organizationId, role: 'Agent', active: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!agents.length) return;

  const idx = org.assignRoundRobinIndex % agents.length;
  const agent = agents[idx];

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedUserId: agent.id },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { assignRoundRobinIndex: idx + 1 },
  });
}
