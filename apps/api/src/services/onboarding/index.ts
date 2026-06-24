import { ONBOARDING_STEPS } from '@reach/shared';
import { prisma } from '../../lib/prisma.js';

export async function getOnboardingState(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error('Organization not found');

  const [waConnected, contactCount, campaignCount] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { organizationId, active: true } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.campaign.count({ where: { organizationId } }),
  ]);

  const autoStep = org.onboardingDoneAt
    ? ONBOARDING_STEPS.length
    : waConnected > 0 && contactCount > 0 && campaignCount > 0
      ? 3
      : waConnected > 0 && contactCount > 0
        ? 2
        : waConnected > 0
          ? 1
          : 0;

  const step = Math.max(org.onboardingStep, autoStep);
  const completed = !!org.onboardingDoneAt || step >= ONBOARDING_STEPS.length;

  return {
    step,
    completed,
    completedAt: org.onboardingDoneAt,
    steps: ONBOARDING_STEPS.map((s) => ({
      ...s,
      done: s.id < step || completed,
      current: s.id === step && !completed,
    })),
    checks: { waConnected: waConnected > 0, contactCount, campaignCount },
  };
}

export async function advanceOnboarding(organizationId: string, step: number): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { onboardingStep: step },
  });
}

export async function completeOnboarding(organizationId: string): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      onboardingStep: ONBOARDING_STEPS.length,
      onboardingDoneAt: new Date(),
    },
  });
}
