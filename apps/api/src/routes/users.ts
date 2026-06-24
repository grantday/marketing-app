import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashPassword } from '../lib/password.js';

const router = Router();

router.get('/', requireAuth, requireRole('Admin'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.user!.organizationId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      active: true,
      createdAt: true,
      skillsJson: true,
      languagesJson: true,
    },
    orderBy: { fullName: 'asc' },
  });
  res.json(users.map((u) => ({
    ...u,
    skills: JSON.parse(u.skillsJson || '[]') as string[],
    languages: JSON.parse(u.languagesJson || '[]') as string[],
  })));
});

router.post('/', requireAuth, requireRole('Admin'), async (req, res) => {
  const { email, password, fullName, role } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    role?: string;
  };
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'email, password, fullName required' });
  }

  const user = await prisma.user.create({
    data: {
      organizationId: req.user!.organizationId,
      email,
      passwordHash: await hashPassword(password),
      fullName,
      role: role || 'Agent',
    },
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });
  res.status(201).json(user);
});

router.patch('/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const { skills, languages } = req.body as { skills?: string[]; languages?: string[] };
  const user = await prisma.user.findFirst({
    where: { id: String(req.params.id), organizationId: req.user!.organizationId },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });

  const data: Record<string, string> = {};
  if (skills) data.skillsJson = JSON.stringify(skills);
  if (languages) data.languagesJson = JSON.stringify(languages);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { id: true, email: true, fullName: true, role: true, active: true, skillsJson: true, languagesJson: true },
  });
  res.json({
    ...updated,
    skills: JSON.parse(updated.skillsJson || '[]'),
    languages: JSON.parse(updated.languagesJson || '[]'),
  });
});

export default router;
