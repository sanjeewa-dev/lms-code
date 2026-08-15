import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import { enrollmentStatusForNetFee } from '../lib/fees';
import { badRequest, conflict, notFound } from '../utils/httpError';

export function classJoinUrl(slug: string, token: string) {
  return `${env.clientUrl}/${slug}/join/${token}`;
}

async function getLink(tenantId: string, token: string) {
  return basePrisma.classInviteLink.findFirst({
    where: { tenantId, token, isActive: true },
    include: {
      class: {
        select: {
          id: true, title: true, description: true, price: true, isPublished: true,
          teacher: { select: { name: true } },
        },
      },
      tenant: { select: { name: true, slug: true } },
    },
  });
}

function requireOpenClass<T extends { class: { isPublished: boolean } } | null>(link: T): NonNullable<T> {
  if (!link) throw notFound('Invite link not found or inactive');
  if (!link.class.isPublished) throw badRequest('This class is not open for enrollment');
  return link;
}

export async function getOrCreateClassInviteLink(opts: {
  tenantId: string; tenantSlug: string; classId: string; createdById: string;
}) {
  const existing = await basePrisma.classInviteLink.findUnique({ where: { classId: opts.classId } });
  if (existing) {
    return {
      inviteUrl: classJoinUrl(opts.tenantSlug, existing.token),
      isActive: existing.isActive,
      createdAt: existing.createdAt,
    };
  }
  const token = crypto.randomBytes(24).toString('hex');
  const link = await basePrisma.classInviteLink.create({
    data: { tenantId: opts.tenantId, classId: opts.classId, token, createdById: opts.createdById },
  });
  return { inviteUrl: classJoinUrl(opts.tenantSlug, token), isActive: link.isActive, createdAt: link.createdAt };
}

export async function rotateClassInviteLink(opts: {
  tenantId: string; tenantSlug: string; classId: string; createdById: string;
}) {
  const token = crypto.randomBytes(24).toString('hex');
  const link = await basePrisma.classInviteLink.upsert({
    where: { classId: opts.classId },
    create: { tenantId: opts.tenantId, classId: opts.classId, token, createdById: opts.createdById },
    update: { token, createdById: opts.createdById, isActive: true },
  });
  return { inviteUrl: classJoinUrl(opts.tenantSlug, token), isActive: link.isActive, createdAt: link.createdAt };
}

export async function setClassInviteLinkActive(opts: { classId: string; isActive: boolean }) {
  const link = await basePrisma.classInviteLink.findUnique({ where: { classId: opts.classId } });
  if (!link) throw notFound('Invite link not found');
  return basePrisma.classInviteLink.update({ where: { classId: opts.classId }, data: { isActive: opts.isActive } });
}

export async function getClassJoinInfo(tenantId: string, token: string) {
  const link = requireOpenClass(await getLink(tenantId, token));
  return {
    class: {
      id: link.class.id, title: link.class.title, description: link.class.description,
      price: Number(link.class.price), teacherName: link.class.teacher?.name ?? null,
    },
    instituteName: link.tenant.name,
    slug: link.tenant.slug,
  };
}

export async function registerViaClassInvite(opts: {
  tenantId: string; token: string; name: string; email: string; password: string;
}) {
  const link = requireOpenClass(await getLink(opts.tenantId, opts.token));
  const email = opts.email.toLowerCase().trim();
  if (await basePrisma.user.findFirst({ where: { tenantId: opts.tenantId, email } })) {
    throw conflict('An account with this email already exists. Sign in, then open this invite link again to join the class.');
  }
  const status = enrollmentStatusForNetFee(link.class.price);
  const student = await basePrisma.user.create({
    data: {
      tenantId: opts.tenantId, name: opts.name.trim(), email, passwordHash: await bcrypt.hash(opts.password, 10),
      role: 'student', status: 'approved',
      enrollments: {
        create: { tenantId: opts.tenantId, classId: link.class.id, status, feeWaiverAmount: 0 },
      },
    },
  });
  return {
    student: { id: student.id, name: student.name, email: student.email },
    class: { id: link.class.id, title: link.class.title },
    enrollmentStatus: status,
  };
}

export async function enrollViaClassInvite(opts: { tenantId: string; token: string; studentId: string }) {
  const link = requireOpenClass(await getLink(opts.tenantId, opts.token));
  const student = await basePrisma.user.findFirst({
    where: { id: opts.studentId, tenantId: opts.tenantId, role: 'student' },
  });
  if (!student) throw badRequest('Only students can join a class with this link');
  const existing = await basePrisma.enrollment.findFirst({ where: { classId: link.class.id, studentId: student.id } });
  if (existing) {
    return { enrollment: existing, class: { id: link.class.id, title: link.class.title }, alreadyEnrolled: true };
  }
  const enrollment = await basePrisma.enrollment.create({
    data: {
      tenantId: opts.tenantId, classId: link.class.id, studentId: student.id,
      status: enrollmentStatusForNetFee(link.class.price), feeWaiverAmount: 0,
    },
  });
  return { enrollment, class: { id: link.class.id, title: link.class.title }, alreadyEnrolled: false };
}
