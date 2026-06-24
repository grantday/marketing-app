import { prisma } from '../../lib/prisma.js';
import { parseJsonObject } from '../../lib/phone.js';

interface AbTestConfig {
  enabled?: boolean;
  variantA?: { templateId: string; label?: string };
  variantB?: { templateId: string; label?: string };
  splitPercent?: number;
  winnerMetric?: 'read' | 'reply';
  winner?: 'A' | 'B' | null;
}

export function parseAbTest(json: string): AbTestConfig {
  try {
    return JSON.parse(json) as AbTestConfig;
  } catch {
    return {};
  }
}

export function assignVariant(ab: AbTestConfig): 'A' | 'B' {
  const pct = ab.splitPercent ?? 50;
  return Math.random() * 100 < pct ? 'A' : 'B';
}

export async function pickAbTestWinner(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { recipients: true },
  });
  if (!campaign) return;

  const ab = parseAbTest(campaign.abTestJson);
  if (!ab.enabled || ab.winner) return;

  const metric = ab.winnerMetric ?? 'read';
  const stats = { A: { total: 0, score: 0 }, B: { total: 0, score: 0 } };

  for (const r of campaign.recipients) {
    const v = (r.variantLabel ?? 'A') as 'A' | 'B';
    if (!stats[v]) continue;
    stats[v].total++;
    if (metric === 'read' && r.readAt) stats[v].score++;
    if (metric === 'reply' && r.repliedAt) stats[v].score++;
  }

  const rateA = stats.A.total > 0 ? stats.A.score / stats.A.total : 0;
  const rateB = stats.B.total > 0 ? stats.B.score / stats.B.total : 0;
  const winner: 'A' | 'B' = rateB > rateA ? 'B' : 'A';

  const updated = { ...ab, winner, rateA: Math.round(rateA * 100), rateB: Math.round(rateB * 100) };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { abTestJson: JSON.stringify(updated) },
  });
}

export async function getTemplateForRecipient(
  campaignId: string,
  contactId: string,
): Promise<{ templateId: string; variantLabel: string } | null> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;

  const ab = parseAbTest(campaign.abTestJson);
  if (!ab.enabled) return { templateId: campaign.templateId, variantLabel: 'A' };

  const existing = await prisma.campaignRecipient.findUnique({
    where: { campaignId_contactId: { campaignId, contactId } },
  });
  if (existing?.variantLabel) {
    const v = existing.variantLabel as 'A' | 'B';
    const tpl = v === 'B' ? ab.variantB?.templateId : ab.variantA?.templateId;
    return { templateId: tpl ?? campaign.templateId, variantLabel: v };
  }

  const v = assignVariant(ab);
  const tpl = v === 'B' ? ab.variantB?.templateId : ab.variantA?.templateId;
  return { templateId: tpl ?? campaign.templateId, variantLabel: v };
}
