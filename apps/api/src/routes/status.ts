import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { checkRedis } from '../lib/redisHealth.js';

const router = Router();

router.get('/', async (_req, res) => {
  const started = Date.now();
  let dbOk = false;
  let orgCount = 0;
  try {
    orgCount = await prisma.organization.count();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const redisOk = await checkRedis();
  const metaConfigured = !!(process.env.META_APP_ID || process.env.META_ACCESS_TOKEN);
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

  const healthy = dbOk && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'operational' : 'degraded',
    service: 'reach',
    version: '7.0.0',
    latencyMs: Date.now() - started,
    checks: {
      database: dbOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      metaApi: metaConfigured ? 'configured' : 'not_configured',
      stripe: stripeConfigured ? 'configured' : 'not_configured',
    },
    tenants: orgCount,
    timestamp: new Date().toISOString(),
  });
});

export default router;
