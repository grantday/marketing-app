import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { extractApiKey, verifyApiKey } from '../lib/apiKey.js';

export interface ApiKeyPayload {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyPayload;
    }
  }
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = extractApiKey(req);
  if (!key) {
    res.status(401).json({ error: 'API key required. Use Authorization: Bearer <key> or X-API-Key header.' });
    return;
  }

  const prefix = key.slice(0, 12);
  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix: prefix, active: true },
    take: 5,
  });

  for (const candidate of candidates) {
    if (verifyApiKey(key, candidate.keyHash)) {
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(candidate.scopes) as string[];
      } catch {
        scopes = ['read', 'write'];
      }
      req.apiKey = {
        organizationId: candidate.organizationId,
        apiKeyId: candidate.id,
        scopes,
      };
      await prisma.apiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Invalid API key' });
}

export function requireScope(...needed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const ok = needed.every((s) => req.apiKey!.scopes.includes(s) || req.apiKey!.scopes.includes('admin'));
    if (!ok) {
      res.status(403).json({ error: 'Insufficient scope' });
      return;
    }
    next();
  };
}
