import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { writeAuditLog } from './audit';

const SUPPORT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function startSupportSession(opts: {
  superadminId: string;
  superadminEmail: string;
  tenantId: string;
  reason: string;
  ip?: string | null;
}) {
  const reason = opts.reason.trim();
  if (reason.length < 5) throw badRequest('Support reason must be at least 5 characters');

  const tenant = await basePrisma.tenant.findUnique({ where: { id: opts.tenantId } });
  if (!tenant) throw notFound('Tenant not found');
  if (!tenant.isActive) throw forbidden('Tenant is inactive');

  const superadmin = await basePrisma.user.findUnique({ where: { id: opts.superadminId } });
  if (!superadmin || superadmin.role !== 'superadmin') throw forbidden('Only superadmins can start support sessions');

  // End any open sessions for this actor
  await basePrisma.supportSession.updateMany({
    where: { superadminId: opts.superadminId, endedAt: null },
    data: { endedAt: new Date() },
  });

  const expiresAt = new Date(Date.now() + SUPPORT_TTL_MS);
  const session = await basePrisma.supportSession.create({
    data: {
      superadminId: opts.superadminId,
      tenantId: tenant.id,
      reason,
      tokenHash: 'pending',
      expiresAt,
    },
  });

  // Shorter-lived support access (2h)
  const supportAccessToken = jwt.sign(
    {
      sub: superadmin.id,
      role: 'superadmin',
      email: superadmin.email,
      name: superadmin.name,
      tenantId: tenant.id,
      supportSessionId: session.id,
    },
    env.jwt.accessSecret,
    { expiresIn: '2h' }
  );

  await basePrisma.supportSession.update({
    where: { id: session.id },
    data: { tokenHash: hashToken(supportAccessToken) },
  });

  await writeAuditLog({
    actorId: opts.superadminId,
    actorEmail: opts.superadminEmail,
    action: 'support_session.start',
    tenantId: tenant.id,
    targetType: 'SupportSession',
    targetId: session.id,
    meta: { reason, slug: tenant.slug },
    ip: opts.ip,
  });

  return {
    session: {
      id: session.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      reason,
      expiresAt: expiresAt.toISOString(),
    },
    accessToken: supportAccessToken,
    // Keep a refresh unused; support uses short-lived access only
  };
}

export async function endSupportSession(opts: {
  sessionId: string;
  superadminId: string;
  superadminEmail: string;
  ip?: string | null;
}) {
  const session = await basePrisma.supportSession.findUnique({
    where: { id: opts.sessionId },
    include: { tenant: { select: { id: true, slug: true, name: true } } },
  });
  if (!session) throw notFound('Support session not found');
  if (session.superadminId !== opts.superadminId) throw forbidden('Not your support session');

  if (!session.endedAt) {
    await basePrisma.supportSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
  }

  await writeAuditLog({
    actorId: opts.superadminId,
    actorEmail: opts.superadminEmail,
    action: 'support_session.end',
    tenantId: session.tenantId,
    targetType: 'SupportSession',
    targetId: session.id,
    meta: { slug: session.tenant.slug },
    ip: opts.ip,
  });

  return { ok: true, tenantSlug: session.tenant.slug, tenantId: session.tenantId };
}

export async function getActiveSupportSession(sessionId: string, superadminId: string) {
  const session = await basePrisma.supportSession.findFirst({
    where: {
      id: sessionId,
      superadminId,
      endedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { tenant: { select: { id: true, slug: true, name: true } } },
  });
  return session;
}
