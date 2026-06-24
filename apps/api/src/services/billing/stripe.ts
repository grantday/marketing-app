import Stripe from 'stripe';
import { PLANS, type PlanId } from '@reach/shared';
import { prisma } from '../../lib/prisma.js';
import { applyPlan, resetBillingPeriod } from './limits.js';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

function priceIdForPlan(planId: PlanId): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  };
  return map[planId];
}

export function isStripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function ensureStripeCustomer(organizationId: string, email: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error('Organization not found');
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name: org.name,
    metadata: { organizationId },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id, billingEmail: email },
  });

  return customer.id;
}

export async function createCheckoutSession(
  organizationId: string,
  planId: PlanId,
  email: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string } | { devMode: true; planId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    await applyPlan(organizationId, planId);
    return { devMode: true, planId };
  }

  const priceId = priceIdForPlan(planId);
  if (!priceId) throw new Error(`Stripe price not configured for plan: ${planId}`);

  const customerId = await ensureStripeCustomer(organizationId, email);
  const session = await stripe.checkout.sessions.create({
    customer: customerId!,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId, planId },
    subscription_data: { metadata: { organizationId, planId } },
  });

  if (!session.url) throw new Error('Failed to create checkout session');
  return { url: session.url };
}

export async function createBillingPortalSession(
  organizationId: string,
  returnUrl: string,
): Promise<{ url: string } | { devMode: true }> {
  const stripe = getStripe();
  if (!stripe) return { devMode: true };

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org?.stripeCustomerId) throw new Error('No billing account. Subscribe to a plan first.');

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) throw new Error('Stripe not configured');

  const event = stripe.webhooks.constructEvent(payload, signature, secret);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.organizationId;
    const planId = session.metadata?.planId as PlanId | undefined;
    if (orgId && planId) {
      await applyPlan(orgId, planId);
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          subscriptionStatus: 'active',
        },
      });
      await resetBillingPeriod(orgId);
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata?.organizationId;
    if (!orgId) return;

    const status = sub.status === 'active' ? 'active' : sub.status === 'trialing' ? 'trialing' : 'canceled';
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: status,
        stripeSubscriptionId: sub.id,
      },
    });

    if (event.type === 'customer.subscription.deleted') {
      await applyPlan(orgId, 'trial');
    }
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId);
      const orgId = sub.metadata?.organizationId;
      if (orgId) await resetBillingPeriod(orgId);
    }
  }
}

export function listPlansForUi() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    contactLimit: p.contactLimit,
    messageLimit: p.messageLimit,
    description: p.description,
    stripeEnabled: isStripeEnabled() && !!priceIdForPlan(p.id as PlanId),
  }));
}
