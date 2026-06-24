import { PLANS, type PlanId } from '@reach/shared';
import { prisma } from '../../lib/prisma.js';

export function getPlanLimits(planId: string) {
  const plan = PLANS[planId as PlanId] ?? PLANS.trial;
  return { contactLimit: plan.contactLimit, messageLimit: plan.messageLimit };
}

export async function getOrgUsage(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error('Organization not found');

  const contactCount = await prisma.contact.count({ where: { organizationId } });
  const plan = PLANS[org.plan as PlanId] ?? PLANS.trial;
  const trialActive = org.plan === 'trial' && org.trialEndsAt && org.trialEndsAt > new Date();

  return {
    plan: org.plan,
    planName: plan.name,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    trialActive,
    contactCount,
    contactLimit: org.contactLimit,
    messagesUsed: org.messagesUsedPeriod,
    messageLimit: org.messageLimit,
    billingPeriodStart: org.billingPeriodStart,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
  };
}

export async function assertCanSendMessages(organizationId: string, count = 1): Promise<void> {
  const usage = await getOrgUsage(organizationId);
  if (usage.plan === 'trial' && !usage.trialActive && usage.subscriptionStatus !== 'active') {
    throw new Error('Trial expired. Upgrade your plan in Billing to continue sending.');
  }
  if (usage.messagesUsed + count > usage.messageLimit) {
    throw new Error(`Message limit reached (${usage.messageLimit}/period). Upgrade your plan in Billing.`);
  }
}

export async function assertCanAddContacts(organizationId: string, count = 1): Promise<void> {
  const usage = await getOrgUsage(organizationId);
  if (usage.contactCount + count > usage.contactLimit) {
    throw new Error(`Contact limit reached (${usage.contactLimit}). Upgrade your plan in Billing.`);
  }
}

export async function recordMessageUsage(organizationId: string, count = 1): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { messagesUsedPeriod: { increment: count } },
  });
}

export async function resetBillingPeriod(organizationId: string): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      messagesUsedPeriod: 0,
      billingPeriodStart: new Date(),
    },
  });
}

export async function applyPlan(organizationId: string, planId: PlanId): Promise<void> {
  const limits = getPlanLimits(planId);
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: planId,
      contactLimit: limits.contactLimit,
      messageLimit: limits.messageLimit,
      subscriptionStatus: planId === 'trial' ? 'trialing' : 'active',
    },
  });
}
