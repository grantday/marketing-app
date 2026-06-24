import { Router } from 'express';
import type { PlanId } from '@reach/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getOrgUsage } from '../services/billing/limits.js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  isStripeEnabled,
  listPlansForUi,
} from '../services/billing/stripe.js';

const router = Router();

router.get('/plans', requireAuth, (_req, res) => {
  res.json({ plans: listPlansForUi(), stripeEnabled: isStripeEnabled() });
});

router.get('/usage', requireAuth, async (req, res) => {
  const usage = await getOrgUsage(req.user!.organizationId);
  res.json(usage);
});

router.post('/checkout', requireAuth, requireRole('Admin'), async (req, res) => {
  const { planId } = req.body as { planId?: PlanId };
  if (!planId || planId === 'trial') {
    return res.status(400).json({ error: 'Valid paid plan required' });
  }

  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5174';
  const result = await createCheckoutSession(
    req.user!.organizationId,
    planId,
    req.user!.email,
    `${origin}/billing?success=1`,
    `${origin}/billing?canceled=1`,
  );

  res.json(result);
});

router.post('/portal', requireAuth, requireRole('Admin'), async (req, res) => {
  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5174';
  const result = await createBillingPortalSession(req.user!.organizationId, `${origin}/billing`);
  res.json(result);
});

export default router;
