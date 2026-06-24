import { prisma } from '../../lib/prisma.js';

export async function recordFirstResponse(
  conversationId: string,
  userId: string,
): Promise<void> {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo || convo.firstResponseAt) return;

  const org = await prisma.organization.findUnique({ where: { id: convo.organizationId } });
  const slaMinutes = org?.slaFirstResponseMinutes ?? 60;
  const elapsed = (Date.now() - convo.createdAt.getTime()) / 60000;
  const breached = elapsed > slaMinutes;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      firstResponseAt: new Date(),
      firstResponseByUserId: userId,
      slaBreached: breached || convo.slaBreached,
    },
  });
}

export async function checkSlaBreaches(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true, slaFirstResponseMinutes: true, slaResolutionMinutes: true } });

  for (const org of orgs) {
    const frCutoff = new Date(Date.now() - org.slaFirstResponseMinutes * 60000);
    await prisma.conversation.updateMany({
      where: {
        organizationId: org.id,
        firstResponseAt: null,
        resolvedAt: null,
        createdAt: { lt: frCutoff },
        slaBreached: false,
      },
      data: { slaBreached: true },
    });

    const resCutoff = new Date(Date.now() - org.slaResolutionMinutes * 60000);
    await prisma.conversation.updateMany({
      where: {
        organizationId: org.id,
        resolvedAt: null,
        createdAt: { lt: resCutoff },
        slaBreached: false,
      },
      data: { slaBreached: true },
    });
  }
}

export async function getSlaReport(organizationId: string) {
  const since = new Date(Date.now() - 30 * 86400000);
  const convos = await prisma.conversation.findMany({
    where: { organizationId, createdAt: { gte: since } },
    include: {
      assignedUser: { select: { id: true, fullName: true } },
      messages: { where: { direction: 'Inbound' }, take: 1 },
    },
  });

  const agents = new Map<string, { name: string; handled: number; avgFirstResponseMin: number; breached: number }>();

  let totalFirstResponse = 0;
  let withResponse = 0;
  let breached = 0;

  for (const c of convos) {
    if (c.slaBreached) breached++;
    if (c.firstResponseAt) {
      const mins = (c.firstResponseAt.getTime() - c.createdAt.getTime()) / 60000;
      totalFirstResponse += mins;
      withResponse++;
    }

    const agentId = c.assignedUserId ?? 'unassigned';
    const name = c.assignedUser?.fullName ?? 'Unassigned';
    const entry = agents.get(agentId) ?? { name, handled: 0, avgFirstResponseMin: 0, breached: 0 };
    entry.handled++;
    if (c.slaBreached) entry.breached++;
    if (c.firstResponseAt) {
      entry.avgFirstResponseMin += (c.firstResponseAt.getTime() - c.createdAt.getTime()) / 60000;
    }
    agents.set(agentId, entry);
  }

  const leaderboard = [...agents.entries()].map(([id, v]) => ({
    agentId: id,
    name: v.name,
    handled: v.handled,
    avgFirstResponseMin: v.handled > 0 ? Math.round(v.avgFirstResponseMin / v.handled) : 0,
    slaBreached: v.breached,
  }));

  const resolved = convos.filter((c) => c.resolvedAt);
  let avgResolution = 0;
  if (resolved.length) {
    avgResolution =
      resolved.reduce((s, c) => s + (c.resolvedAt!.getTime() - c.createdAt.getTime()), 0) /
      resolved.length /
      60000;
  }

  const csatScores = convos.filter((c) => c.csatScore != null).map((c) => c.csatScore!);
  const avgCsat = csatScores.length
    ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 10) / 10
    : null;

  return {
    period: '30d',
    conversations: convos.length,
    avgFirstResponseMin: withResponse > 0 ? Math.round(totalFirstResponse / withResponse) : null,
    avgResolutionMin: resolved.length > 0 ? Math.round(avgResolution) : null,
    slaBreached: breached,
    slaBreachRate: convos.length > 0 ? Math.round((breached / convos.length) * 100) : 0,
    avgCsat,
    leaderboard,
  };
}

export function slaReportToCsv(report: Awaited<ReturnType<typeof getSlaReport>>): string {
  const lines = [
    'metric,value',
    `conversations,${report.conversations}`,
    `avg_first_response_min,${report.avgFirstResponseMin ?? ''}`,
    `avg_resolution_min,${report.avgResolutionMin ?? ''}`,
    `sla_breached,${report.slaBreached}`,
    `sla_breach_rate_pct,${report.slaBreachRate}`,
    `avg_csat,${report.avgCsat ?? ''}`,
    '',
    'agent,handled,avg_first_response_min,sla_breached',
    ...report.leaderboard.map(
      (a) => `${a.name},${a.handled},${a.avgFirstResponseMin},${a.slaBreached}`,
    ),
  ];
  return lines.join('\n');
}
