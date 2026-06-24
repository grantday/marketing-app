export const PLANS = {
  trial: {
    id: 'trial',
    name: 'Trial',
    contactLimit: 500,
    messageLimit: 2000,
    priceMonthly: 0,
    description: '14-day trial with full features',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    contactLimit: 2000,
    messageLimit: 10000,
    priceMonthly: 49,
    description: 'Small teams getting started with WhatsApp marketing',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    contactLimit: 10000,
    messageLimit: 50000,
    priceMonthly: 149,
    description: 'Growing businesses with automation and AI',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    contactLimit: 100000,
    messageLimit: 500000,
    priceMonthly: 499,
    description: 'High volume, SLA, and white-label options',
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const ONBOARDING_STEPS = [
  { id: 0, key: 'welcome', title: 'Welcome', description: 'Confirm your organization profile' },
  { id: 1, key: 'whatsapp', title: 'Connect WhatsApp', description: 'Link your Meta Business account' },
  { id: 2, key: 'contacts', title: 'Add contacts', description: 'Import or create your first audience' },
  { id: 3, key: 'campaign', title: 'First campaign', description: 'Send a test message to validate setup' },
] as const;
