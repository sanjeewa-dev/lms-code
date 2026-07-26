import { AsyncLocalStorage } from 'async_hooks';
import type { Role } from '@prisma/client';

export interface RequestContext {
  tenantId: string | null;
  role?: Role;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/** Returns the current tenantId or throws if there is no tenant context. */
export function requireTenantId(): string {
  const id = currentTenantId();
  if (!id) throw new Error('No tenant context available for this operation');
  return id;
}
