import type { Role } from '../api/types';

/** Institute admin or platform admin in a tenant support session. */
export function isInstituteAdmin(role?: Role | string | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

/** Can manage classes / staff features in a tenant (admin, teacher, or platform admin). */
export function isTenantStaff(role?: Role | string | null): boolean {
  return role === 'admin' || role === 'teacher' || role === 'superadmin';
}
