import type { Role, User } from '@prisma/client';

function shippingLabelPhotoUrl(user: User, tenantSlug: string | null | undefined) {
  if (!user.shippingLabelPhotoFileId || !tenantSlug) return null;
  // Include file id so clients reload preview after replace (path alone is stable).
  return `/api/t/${tenantSlug}/profile/shipping-label-photo?v=${user.shippingLabelPhotoFileId}`;
}

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
    return {
      ...base,
      subject: user.subject,
      address: user.address,
      shippingLabelPhotoUrl: shippingLabelPhotoUrl(user, user.tenant?.slug),
      shippingLabelPhotoOnly: user.shippingLabelPhotoOnly,
    };
  }

  if (user.role === 'student') {
    return {
      ...base,
      guardianName: user.guardianName,
      guardianPhone: user.guardianPhone,
      guardianEmail: user.guardianEmail,
      area: user.area,
      district: user.district,
      school: user.school,
      address: user.address,
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
