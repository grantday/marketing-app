import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { eventBus } from '../lib/events.js';

const router = Router();

router.get('/stream', requireAuth, (req, res) => {
  const orgId = req.user!.organizationId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onEvent = () => {
    res.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  };

  eventBus.on(`org:${orgId}`, onEvent);
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off(`org:${orgId}`, onEvent);
  });
});

export default router;
