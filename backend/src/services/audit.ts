import type { Prisma } from '@prisma/client';
import { basePrisma } from '../lib/prisma';

export async function writeAuditLog(opts: {
  actorId?: string | null;
  actorEmail: string;
  action: string;
  tenantId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await basePrisma.auditLog.create({
      data: {
        actorId: opts.actorId ?? undefined,
        actorEmail: opts.actorEmail,
        action: opts.action,
        tenantId: opts.tenantId ?? undefined,
        targetType: opts.targetType,
        targetId: opts.targetId,
        meta: (opts.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: opts.ip ?? undefined,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write log', err);
  }
}
