import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  advanceOnboarding,
  completeOnboarding,
  getOnboardingState,
} from '../services/onboarding/index.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const state = await getOnboardingState(req.user!.organizationId);
  res.json(state);
});

router.patch('/', requireAuth, async (req, res) => {
  const { step, orgName } = req.body as { step?: number; orgName?: string };
  const orgId = req.user!.organizationId;

  if (typeof orgName === 'string' && orgName.trim()) {
    await prisma.organization.update({
      where: { id: orgId },
      data: { name: orgName.trim() },
    });
  }

  if (typeof step === 'number') {
    await advanceOnboarding(orgId, step);
  }

  res.json(await getOnboardingState(orgId));
});

router.post('/complete', requireAuth, async (req, res) => {
  await completeOnboarding(req.user!.organizationId);
  res.json(await getOnboardingState(req.user!.organizationId));
});

export default router;
