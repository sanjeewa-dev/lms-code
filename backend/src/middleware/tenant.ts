import type { Request, Response, NextFunction } from 'express';
import { basePrisma } from '../lib/prisma';
import { runWithContext } from '../lib/tenantContext';
import { asyncHandler } from '../utils/asyncHandler';
import { forbidden, notFound, unauthorized } from '../utils/httpError';

/**
 * Resolves the tenant from the `:slug` route param using the unscoped client
 * and attaches it to req.tenant. Rejects unknown or deactivated tenants.
 */
export const resolveTenant = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const slug = req.params.slug;
  if (!slug) return next(notFound('Tenant not specified'));
  const tenant = await basePrisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return next(notFound('Institute not found'));
  if (!tenant.isActive) return next(forbidden('This institute is not active'));
  req.tenant = tenant;
  return next();
});

/**
 * Ensures the authenticated user belongs to the resolved tenant. Superadmins
 * are allowed through for cross-tenant support/administration.
 */
export function requireTenantMatch(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.tenant) return next(notFound('Institute not found'));
  if (req.user.role === 'superadmin') return next();
  if (req.user.tenantId !== req.tenant.id) {
    return next(forbidden('You do not belong to this institute'));
  }
  return next();
}

/**
 * Establishes the AsyncLocalStorage request context so the scoped Prisma client
 * automatically isolates all queries to this tenant. Must run before any
 * handler that touches tenant data.
 */
export function enterTenantContext(req: Request, _res: Response, next: NextFunction) {
  const tenantId = req.tenant?.id ?? req.user?.tenantId ?? null;
  runWithContext(
    { tenantId, role: req.user?.role, userId: req.user?.sub },
    () => next()
  );
}
