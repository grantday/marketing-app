import { prisma } from './prisma.js';

export async function writeAudit(
  organizationId: string,
  action: string,
  opts: { userId?: string; entityType?: string; entityId?: string; details?: Record<string, unknown> } = {},
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: opts.userId,
      action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      details: JSON.stringify(opts.details ?? {}),
    },
  });
}
