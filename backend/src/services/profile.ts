import type { Role, User } from '@prisma/client';

export function serializeProfile(user: User & { tenant?: { slug: string; name: string } | null }) {
  const base = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    tenantSlug: user.tenant?.slug ?? null,
    tenantName: user.tenant?.name ?? null,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
  };

  if (user.role === 'teacher') {
    return { ...base, subject: user.subject };
  }

  if (user.role === 'student') {
    return {
      ...base,
      guardianName: user.guardianName,
      guardianPhone: user.guardianPhone,
      area: user.area,
      district: user.district,
    };
  }

  return base;
}

export function publicUserFromProfile(user: User & { tenant?: { slug: string; name: string } | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    tenantId: user.tenantId,
    tenantSlug: user.tenant?.slug ?? null,
  };
}
