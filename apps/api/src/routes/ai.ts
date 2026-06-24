import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { answerFromKnowledge, suggestReply, getAiMetrics } from '../services/ai/index.js';

const router = Router();

router.post('/assist/:conversationId', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId;
  const result = await suggestReply(orgId, String(req.params.conversationId));
  res.json(result);
});

router.post('/test', requireAuth, async (req, res) => {
  const { question } = req.body as { question?: string };
  if (!question) return res.status(400).json({ error: 'question required' });
  const result = await answerFromKnowledge(req.user!.organizationId, question);
  res.json(result);
});

router.get('/metrics', requireAuth, async (req, res) => {
  const metrics = await getAiMetrics(req.user!.organizationId);
  res.json(metrics);
});

export default router;
