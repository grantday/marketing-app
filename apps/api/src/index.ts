import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import setupRoutes from './routes/setup.js';
import contactsRoutes from './routes/contacts.js';
import listsRoutes from './routes/lists.js';
import templatesRoutes from './routes/templates.js';
import campaignsRoutes from './routes/campaigns.js';
import inboxRoutes from './routes/inbox.js';
import webhooksRoutes, { handleWhatsAppWebhookPost } from './routes/webhooks.js';
import analyticsRoutes from './routes/analytics.js';
import integrationsRoutes from './routes/integrations.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import eventsRoutes from './routes/events.js';
import workflowsRoutes from './routes/workflows.js';
import automationsRoutes from './routes/automations.js';
import developerRoutes from './routes/developer.js';
import publicV1Routes from './routes/v1/public.js';
import zapierRoutes from './routes/v1/zapier.js';
import {
  startCampaignWorker,
  startTemplateSyncWorker,
  startScheduledCampaignWorker,
  scheduleTemplateSync,
  scheduleCampaignPoller,
} from './workers/campaign.js';
import {
  startWorkflowWorker,
  startCrmSyncWorker,
  scheduleWorkflowPoller,
  scheduleCrmPoller,
} from './workers/workflow.js';
import {
  startCrossChannelWorker,
  scheduleCrossChannelPoller,
} from './workers/crossChannel.js';
import {
  startEnterpriseWorker,
  scheduleEnterpriseJobs,
} from './workers/enterprise.js';
import { recordClick } from './services/links/index.js';
import knowledgeRoutes from './routes/knowledge.js';
import aiRoutes from './routes/ai.js';
import reportsRoutes from './routes/reports.js';
import linksRoutes from './routes/links.js';
import billingRoutes from './routes/billing.js';
import onboardingRoutes from './routes/onboarding.js';
import statusRoutes from './routes/status.js';
import brandingRoutes from './routes/branding.js';
import { handleStripeWebhook } from './services/billing/stripe.js';
import { tenantRateLimit } from './middleware/tenantRateLimit.js';
import { prisma } from './lib/prisma.js';
import { checkRedis } from './lib/redisHealth.js';
import { getWebDistPath, isProduction, validateProductionEnv } from './lib/production.js';
import path from 'node:path';
import fs from 'node:fs';

validateProductionEnv();

const app = express();
const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5174';
const SERVE_WEB = process.env.SERVE_WEB === 'true';

if (process.env.TRUST_PROXY === 'true' || isProduction()) {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  const redis = await checkRedis();
  const ok = database && redis;
  res.status(ok ? 200 : 503).json({
    ok,
    service: 'reach-api',
    version: '7.0.0',
    checks: { database, redis },
  });
});

app.get('/l/:code', async (req, res) => {
  const dest = await recordClick(String(req.params.code), req.get('user-agent') ?? undefined);
  if (!dest) return res.status(404).send('Link not found');
  res.redirect(302, dest);
});

app.post(
  '/api/webhooks/whatsapp',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    const buf = req.body as Buffer;
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    try {
      req.body = JSON.parse(buf.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  },
  handleWhatsAppWebhookPost,
);

app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const sig = req.get('stripe-signature');
      if (!sig) return res.status(400).send('Missing signature');
      await handleStripeWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (e) {
      console.error('Stripe webhook error:', e);
      res.status(400).send(e instanceof Error ? e.message : 'Webhook error');
    }
  },
);

app.use(express.json({ limit: '2mb' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use(tenantRateLimit);

app.use('/api/setup', setupRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/v1', publicV1Routes);
app.use('/api/v1/zapier', zapierRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/links', linksRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/branding', brandingRoutes);

if (SERVE_WEB) {
  const webDist = getWebDistPath();
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/l/')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
    console.log(`Serving web UI from ${webDist}`);
  } else {
    console.warn(`SERVE_WEB=true but dist not found at ${webDist}`);
  }
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, async () => {
  console.log(`Reach API listening on http://${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);
  startCampaignWorker();
  startTemplateSyncWorker();
  startScheduledCampaignWorker();
  startWorkflowWorker();
  startCrmSyncWorker();
  startCrossChannelWorker();
  startEnterpriseWorker();
  try {
    await scheduleTemplateSync();
    await scheduleCampaignPoller();
    await scheduleWorkflowPoller();
    await scheduleCrmPoller();
    await scheduleCrossChannelPoller();
    await scheduleEnterpriseJobs();
    console.log('Scheduled jobs: all workers registered');
  } catch (e) {
    console.warn('Could not register scheduled jobs (Redis may be unavailable):', e);
  }
});
