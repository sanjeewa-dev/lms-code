import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import { sendAdminInvite } from './email';
import { badRequest, conflict, notFound } from '../utils/httpError';

const INVITE_DAYS = 7;

function inviteUrl(slug: string, token: string) {
  return `${env.clientUrl}/${slug}/admin-invite/${token}`;
}

export async function inviteTenantAdmin(opts: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  invitedById: string;
  email: string;
}) {
  const email = opts.email.toLowerCase().trim();

  let admin = await basePrisma.user.findFirst({ where: { tenantId: opts.tenantId, email } });
  if (admin && admin.role !== 'admin') {
    throw conflict('A non-admin account already uses that email in this institute');
  }
  if (admin?.passwordHash) {
    throw conflict('An admin with that email already has an active account');
  }

  if (!admin) {
    const local = email.split('@')[0] || 'Admin';
    admin = await basePrisma.user.create({
      data: {
        tenantId: opts.tenantId,
        email,
        name: local,
        role: 'admin',
        passwordHash: null,
        status: 'approved',
      },
    });
  }

  // Invalidate previous unused invites for this email/tenant.
  await basePrisma.adminInvite.updateMany({
    where: { tenantId: opts.tenantId, email, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_DAYS);

  const invite = await basePrisma.adminInvite.create({
    data: {
      tenantId: opts.tenantId,
      email,
      token,
      invitedById: opts.invitedById,
      userId: admin.id,
      expiresAt,
    },
  });

  const url = inviteUrl(opts.tenantSlug, token);
  await sendAdminInvite({
    to: email,
    instituteName: opts.tenantName,
    inviteUrl: url,
    tenantId: opts.tenantId,
    relatedId: invite.id,
  });

  return { admin, invited: true as const, inviteUrl: url };
}

export async function getAdminInviteForToken(tenantId: string, token: string) {
  const invite = await basePrisma.adminInvite.findFirst({
    where: { tenantId, token },
    include: { tenant: { select: { name: true, slug: true } } },
  });
  if (!invite) throw notFound('Invitation not found');
  if (invite.usedAt) throw badRequest('This invitation has already been used');
  if (invite.expiresAt < new Date()) throw badRequest('This invitation has expired');

  return {
    invite: {
      email: invite.email,
      instituteName: invite.tenant.name,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
}

export async function acceptAdminInvite(
  tenantId: string,
  token: string,
  data: { name: string; password: string }
) {
  const invite = await basePrisma.adminInvite.findFirst({
    where: { tenantId, token },
  });
  if (!invite) throw notFound('Invitation not found');
  if (invite.usedAt) throw badRequest('This invitation has already been used');
  if (invite.expiresAt < new Date()) throw badRequest('This invitation has expired');
  if (!invite.userId) throw badRequest('Invalid invitation');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const admin = await basePrisma.user.update({
    where: { id: invite.userId },
    data: {
      name: data.name.trim(),
      passwordHash,
      role: 'admin',
      status: 'approved',
    },
  });

  await basePrisma.adminInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  return { admin };
}
