import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/** Per-organization API rate limit (authenticated routes). */
export const tenantRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const user = (req as Request & { user?: { organizationId: string } }).user;
    return user?.organizationId ?? req.ip ?? 'anon';
  },
  message: { error: 'Too many requests for your organization. Please slow down.' },
});
