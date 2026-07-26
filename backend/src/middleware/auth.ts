import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../utils/httpError';
import { asyncHandler } from '../utils/asyncHandler';
import { studentHasContentAccess } from '../services/access';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(unauthorized('Missing or invalid Authorization header'));
  }
  const token = header.slice('Bearer '.length);
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(unauthorized('Invalid or expired access token'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

/**
 * Ensures the requesting student has an active (paid + approved) enrollment in
 * the class identified by req.params[paramName], and that monthly fee gating
 * (if enabled) is satisfied. Admins and the owning teacher bypass.
 */
export function requireActiveEnrollment(paramName = 'classId') {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const classId = req.params[paramName];

    if (req.user.role === 'superadmin' || req.user.role === 'admin') return next();

    const klass = await prisma.class.findFirst({ where: { id: classId } });
    if (!klass) return next(forbidden('Class not found'));

    if (req.user.role === 'teacher' && klass.teacherId === req.user.sub) {
      return next();
    }

    const access = await studentHasContentAccess({
      tenantId: req.tenant!.id,
      classId,
      studentId: req.user.sub,
    });

    if (!access.ok) {
      return next(forbidden(access.reason ?? 'You must have an approved enrollment to access this class'));
    }

    return next();
  });
}
