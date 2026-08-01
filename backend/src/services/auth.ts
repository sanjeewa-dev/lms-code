import { basePrisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import { hashToken } from '../utils/cryptoTokens';
import type { Role, User } from '@prisma/client';
import { unauthorized } from '../utils/httpError';

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

/** Shared gate for login + refresh. */
export function assertUserMayAuthenticate(user: {
  id: string;
  role: Role;
  status: string;
  passwordHash: string | null;
  tenant?: { isActive: boolean } | null;
}) {
  if (user.role !== 'superadmin' && user.tenant && !user.tenant.isActive) {
    throw unauthorized('Invalid email or password');
  }
  if (!user.passwordHash) {
    throw unauthorized('Invalid email or password');
  }
  if (user.status !== 'approved') {
    throw unauthorized('Invalid email or password');
  }
}

export async function revokeRefreshTokensForUser(userId: string) {
  await basePrisma.refreshToken.deleteMany({ where: { userId } });
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
    data: { token: hashToken(refreshToken), userId: user.id, expiresAt },
  });
  return { accessToken, refreshToken };
}
