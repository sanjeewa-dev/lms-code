import { basePrisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import type { Role, User } from '@prisma/client';

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string | null;
  tenant?: { slug: string; name: string } | null;
}, extras?: {
  supportSession?: {
    id: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    expiresAt: string;
  } | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: extras?.supportSession?.tenantId ?? user.tenantId,
    tenantSlug: extras?.supportSession?.tenantSlug ?? user.tenant?.slug ?? null,
    supportSession: extras?.supportSession ?? null,
  };
}

export async function issueTokens(user: User) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
  });
  const refreshToken = signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await basePrisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });
  return { accessToken, refreshToken };
}
