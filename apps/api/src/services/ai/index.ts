import { prisma } from '../../lib/prisma.js';
import { parseJsonArray } from '../../lib/phone.js';

interface AiConfig {
  model?: string;
  escalatePhrase?: string;
}

async function getAiConfig(organizationId: string): Promise<AiConfig & { enabled: boolean }> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  let cfg: AiConfig = {};
  try {
    cfg = JSON.parse(org?.aiConfigJson ?? '{}') as AiConfig;
  } catch {
    /* ignore */
  }
  return { ...cfg, enabled: org?.aiEnabled ?? false };
}

function scoreArticle(query: string, article: { title: string; content: string; tags: string }): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  const text = `${article.title} ${article.content}`.toLowerCase();
  for (const w of words) {
    if (text.includes(w)) score += 1;
  }
  for (const tag of parseJsonArray(article.tags)) {
    if (q.includes(tag.toLowerCase())) score += 2;
  }
  return score;
}

async function callLlm(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export async function answerFromKnowledge(
  organizationId: string,
  question: string,
  conversationId?: string,
): Promise<{ answer: string; escalated: boolean; resolved: boolean }> {
  const cfg = await getAiConfig(organizationId);
  if (!cfg.enabled) {
    return { answer: '', escalated: true, resolved: false };
  }

  const articles = await prisma.knowledgeArticle.findMany({
    where: { organizationId, active: true },
    take: 50,
  });

  const ranked = articles
    .map((a) => ({ a, score: scoreArticle(question, a) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);

  const context = ranked.length
    ? ranked.map((r) => `## ${r.a.title}\n${r.a.content}`).join('\n\n')
    : 'No matching FAQ articles found.';

  const system = `You are a helpful customer support assistant. Answer using ONLY the knowledge base below. If you cannot answer confidently, reply with exactly: ESCALATE\n\nKnowledge base:\n${context}`;
  const llmAnswer = await callLlm(system, question);

  let answer = llmAnswer ?? '';
  let escalated = false;

  if (!llmAnswer && ranked.length > 0) {
    answer = ranked[0].a.content.slice(0, 800);
  } else if (!llmAnswer || llmAnswer.toUpperCase().includes('ESCALATE')) {
    escalated = true;
    answer =
      cfg.escalatePhrase ??
      "I'll connect you with a team member who can help with that.";
  }

  const resolved = !escalated && answer.length > 10;

  await prisma.aiInteraction.create({
    data: {
      organizationId,
      conversationId: conversationId ?? null,
      type: 'bot',
      resolved,
      escalated,
    },
  });

  return { answer, escalated, resolved };
}

export async function suggestReply(
  organizationId: string,
  conversationId: string,
): Promise<{ suggestion: string; sentiment: string; summary: string }> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  const transcript = messages.map((m) => `${m.direction}: ${m.body}`).join('\n');
  const sentimentPrompt = `Classify sentiment as positive, neutral, or negative. Reply with one word only.\n\n${transcript}`;
  const summaryPrompt = `Summarize this conversation in 2 sentences for the next agent.\n\n${transcript}`;
  const suggestPrompt = `Suggest a professional, concise reply the agent should send next. One paragraph max.\n\n${transcript}`;

  const [sentiment, summary, suggestion] = await Promise.all([
    callLlm('You classify customer sentiment.', sentimentPrompt),
    callLlm('You summarize support conversations.', summaryPrompt),
    callLlm('You help support agents write replies.', suggestPrompt),
  ]);

  await prisma.aiInteraction.create({
    data: { organizationId, conversationId, type: 'assist', resolved: false, escalated: false },
  });

  return {
    suggestion: suggestion ?? 'Thank you for your message. How can I help you further?',
    sentiment: (sentiment ?? 'neutral').toLowerCase(),
    summary: summary ?? 'No summary available.',
  };
}

export async function getAiMetrics(organizationId: string): Promise<{
  botTotal: number;
  botResolved: number;
  botEscalated: number;
  resolutionRate: number;
}> {
  const since = new Date(Date.now() - 30 * 86400000);
  const interactions = await prisma.aiInteraction.findMany({
    where: { organizationId, type: 'bot', createdAt: { gte: since } },
  });
  const botTotal = interactions.length;
  const botResolved = interactions.filter((i) => i.resolved).length;
  const botEscalated = interactions.filter((i) => i.escalated).length;
  const resolutionRate = botTotal > 0 ? Math.round((botResolved / botTotal) * 100) : 0;
  return { botTotal, botResolved, botEscalated, resolutionRate };
}
