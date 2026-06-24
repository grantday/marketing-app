import { Router } from 'express';
import { loginSchema, signupSchema } from '@reach/shared';
import { prisma } from '../lib/prisma.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { uniqueOrgSlug, randomToken } from '../lib/slug.js';
import { sendVerificationEmail } from '../services/auth/verification.js';
import { getOnboardingState } from '../services/onboarding/index.js';
import { getOrgUsage } from '../services/billing/limits.js';

const router = Router();

function userPayload(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  organizationId: string;
  organization: { name: string; onboardingDoneAt: Date | null };
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerified,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    onboardingCompleted: !!user.organization.onboardingDoneAt,
  };
}

router.post('/register', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const slug = await uniqueOrgSlug(parsed.data.orgName, async (s) => {
    const found = await prisma.organization.findUnique({ where: { slug: s } });
    return !!found;
  });

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const verifyToken = randomToken(24);
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.orgName,
      slug,
      plan: 'trial',
      subscriptionStatus: 'trialing',
      trialEndsAt,
      billingEmail: parsed.data.email,
      subdomain: slug,
    },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      fullName: parsed.data.fullName,
      role: 'Admin',
      emailVerifyToken: verifyToken,
      emailVerifyExpires: verifyExpires,
    },
    include: { organization: true },
  });

  try {
    await sendVerificationEmail(user.email, user.fullName, verifyToken);
  } catch (e) {
    console.warn('Verification email failed:', e);
  }

  const token = signToken({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    role: user.role,
  });
  setAuthCookie(res, token);

  res.status(201).json({
    user: userPayload(user),
    verifyEmailSent: true,
  });
});

router.post('/verify-email', async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ error: 'token required' });

  const user = await prisma.user.findFirst({
    where: {
      emailVerifyToken: token,
      emailVerifyExpires: { gt: new Date() },
    },
    include: { organization: true },
  });
  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpires: null,
    },
    include: { organization: true },
  });

  const jwt = signToken({
    userId: updated.id,
    organizationId: updated.organizationId,
    email: updated.email,
    role: updated.role,
  });
  setAuthCookie(res, jwt);
  res.json({ user: userPayload(updated) });
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });

  const verifyToken = randomToken(24);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: verifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await sendVerificationEmail(user.email, user.fullName, verifyToken);
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { organization: true },
  });
  if (!user?.active) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    role: user.role,
  });
  setAuthCookie(res, token);
  res.json({ user: userPayload(user) });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { organization: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [onboarding, usage] = await Promise.all([
    getOnboardingState(user.organizationId),
    getOrgUsage(user.organizationId),
  ]);

  res.json({
    ...userPayload(user),
    onboarding,
    usage,
  });
});

export default router;
