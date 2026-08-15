import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../utils/httpError';

/** Institute admins (and platform admins in support) can manage every class in the tenant. */
export function isInstituteAdminRole(role: Role | string | undefined | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

/**
 * Teachers may only manage classes they teach.
 * Institute admins may manage any class in the institute.
 */
export async function assertCanManageClass(
  opts: { role: Role; userId: string },
  classId: string,
  message = 'You can only manage your own classes'
) {
  const klass = await prisma.class.findFirst({ where: { id: classId } });
  if (!klass) throw notFound('Class not found');
  if (isInstituteAdminRole(opts.role)) return klass;
  if (opts.role === 'teacher' && klass.teacherId === opts.userId) return klass;
  throw forbidden(message);
}
