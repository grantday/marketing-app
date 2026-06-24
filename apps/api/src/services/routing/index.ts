import { prisma } from '../../lib/prisma.js';
import { parseJsonArray } from '../../lib/phone.js';

export async function assignBySkills(
  organizationId: string,
  conversationId: string,
  queueName?: string | null,
): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org?.autoAssignEnabled) return;

  const agents = await prisma.user.findMany({
    where: { organizationId, role: 'Agent', active: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!agents.length) return;

  let candidates = agents;

  if (queueName) {
    const withSkill = agents.filter((a) => {
      const skills = parseJsonArray(a.skillsJson);
      return skills.includes(queueName) || skills.includes('*');
    });
    if (withSkill.length) candidates = withSkill;
  }

  const loads = await Promise.all(
    candidates.map(async (a) => ({
      agent: a,
      load: await prisma.conversation.count({
        where: { organizationId, assignedUserId: a.id, resolvedAt: null },
      }),
    })),
  );

  loads.sort((a, b) => a.load - b.load);
  const pick = loads[0]?.agent ?? candidates[0];

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedUserId: pick.id, queueName: queueName ?? undefined },
  });
}

export async function detectLanguage(text: string): Promise<string> {
  const lower = text.toLowerCase();
  if (/\b(mhoro|mangwanani|masikati)\b/.test(lower)) return 'sn';
  if (/\b(hola|gracias|buenos)\b/.test(lower)) return 'es';
  if (/\b(bonjour|merci)\b/.test(lower)) return 'fr';
  return 'en';
}

export async function routeInboundConversation(
  organizationId: string,
  conversationId: string,
  body: string,
  priority?: string,
): Promise<void> {
  const lang = await detectLanguage(body);
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return;

  let queue = convo.queueName;
  if (!queue && body.toUpperCase().includes('URGENT')) {
    queue = 'priority';
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      language: lang,
      priority: priority ?? convo.priority,
      queueName: queue ?? convo.queueName,
    },
  });

  const agents = await prisma.user.findMany({
    where: { organizationId, role: 'Agent', active: true },
  });

  const langMatch = agents.filter((a) => {
    const langs = parseJsonArray(a.languagesJson);
    return langs.includes(lang) || langs.includes('*');
  });

  if (langMatch.length && !convo.assignedUserId) {
    await assignBySkills(organizationId, conversationId, queue);
  } else if (!convo.assignedUserId) {
    const { assignRoundRobin } = await import('../inbox/assign.js');
    await assignRoundRobin(organizationId, conversationId);
  }
}
