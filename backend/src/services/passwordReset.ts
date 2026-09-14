import bcrypt from 'bcryptjs';
import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import { hashToken, randomTokenHex } from '../utils/cryptoTokens';
import { badRequest } from '../utils/httpError';
import { sendPasswordResetEmail } from './email';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible =
    local.length <= 2
      ? local[0] ?? '*'
      : `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

/** Users eligible for self-service password reset. */
export async function findPasswordResetCandidates(email: string, tenantSlug?: string) {
  const users = await basePrisma.user.findMany({
    where: {
      email,
      passwordHash: { not: null },
      ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
    },
    include: { tenant: true },
  });

  return users.filter((u) => {
    if (u.role === 'superadmin') return true;
    if (!u.tenant?.isActive) return false;
    return u.status === 'approved';
  });
}

async function issueResetToken(userId: string): Promise<string> {
  const rawToken = randomTokenHex(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await basePrisma.passwordReset.deleteMany({
    where: { userId, usedAt: null },
  });

  await basePrisma.passwordReset.create({
    data: { userId, tokenHash, expiresAt },
  });

  return rawToken;
}

export async function requestPasswordReset(email: string, tenantSlug?: string) {
  const candidates = await findPasswordResetCandidates(email, tenantSlug);

  if (candidates.length > 1) {
    return {
      multiple: true as const,
      tenants: candidates
        .filter((u) => u.tenant)
        .map((u) => ({ slug: u.tenant!.slug, name: u.tenant!.name })),
    };
  }

  if (candidates.length === 1) {
    const user = candidates[0];
    const rawToken = await issueResetToken(user.id);
    const resetUrl = `${env.clientUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const instituteName =
      user.role === 'superadmin' ? 'Mindspark LMS' : (user.tenant?.name ?? 'your institute');

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        instituteName,
        resetUrl,
        tenantId: user.tenantId,
        relatedId: user.id,
      });
    } catch (err) {
      console.error('[password-reset] Failed to send reset email:', err);
    }
  }

  return { multiple: false as const };
}

export async function validatePasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await basePrisma.passwordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: { tenant: true } } },
  });

  if (!record) return null;

  const { user } = record;
  return {
    email: maskEmail(user.email),
    instituteName:
      user.role === 'superadmin' ? 'Mindspark LMS' : (user.tenant?.name ?? 'your institute'),
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const record = await basePrisma.passwordReset.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!record) throw badRequest('This reset link is invalid or has expired. Request a new one.');

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await basePrisma.$transaction([
    basePrisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    basePrisma.passwordReset.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    basePrisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    basePrisma.passwordReset.deleteMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
    }),
  ]);
}
