import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { basePrisma } from '../lib/prisma';
import { env } from '../config/env';
import { sendStudentClassInvite, sendStudentEnrolledNotice } from './email';
import { badRequest, conflict, notFound } from '../utils/httpError';
import { hashToken } from '../utils/cryptoTokens';
import { clampFeeWaiver, enrollmentStatusForNetFee } from '../lib/fees';
import type { studentInviteSchema, studentOnboardingSchema } from '../validation/schemas';
import type { z } from 'zod';

type InviteInput = z.infer<typeof studentInviteSchema>;
type OnboardingInput = z.infer<typeof studentOnboardingSchema>;

const INVITE_DAYS = 7;

function inviteUrl(slug: string, token: string) {
  return `${env.clientUrl}/${slug}/invite/${token}`;
}

export function normalizePhones(phones?: string[] | null, phone?: string | null): string[] {
  const fromList = (phones ?? []).map((p) => p.trim()).filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)].slice(0, 5);
  const primary = phone?.trim();
  return primary ? [primary] : [];
}

export async function inviteStudentToClass(opts: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  classId: string;
  classTitle: string;
  invitedById: string;
  data: InviteInput;
}) {
  const { tenantId, tenantSlug, tenantName, classId, classTitle, invitedById, data } = opts;
  const email = data.email.toLowerCase().trim();
  const phones = normalizePhones(data.phones, data.phone);
  const primaryPhone = phones[0] ?? null;
  const freeIdCard = Boolean(data.freeIdCard);
  const klass = await basePrisma.class.findFirst({
    where: { id: classId, tenantId },
    select: { price: true },
  });
  if (!klass) throw notFound('Class not found');
  const feeWaiverAmount = clampFeeWaiver(klass.price, data.feeWaiverAmount ?? 0);
  const status = enrollmentStatusForNetFee(klass.price, feeWaiverAmount);

  let student = await basePrisma.user.findFirst({ where: { tenantId, email } });
  if (student && student.role !== 'student') {
    throw conflict('A non-student account already uses that email');
  }

  // Fully registered student — enroll using the fee-gated enrollment status and notify.
  if (student?.passwordHash) {
    let enrollment = await basePrisma.enrollment.findFirst({
      where: { classId, studentId: student.id },
    });
    if (!enrollment) {
      enrollment = await basePrisma.enrollment.create({
        data: { tenantId, classId, studentId: student.id, status, feeWaiverAmount },
      });
    } else if (enrollment.status !== 'active') {
      enrollment = await basePrisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status, feeWaiverAmount },
      });
    } else if (feeWaiverAmount > 0) {
      enrollment = await basePrisma.enrollment.update({
        where: { id: enrollment.id },
        data: { feeWaiverAmount },
      });
    }

    if (freeIdCard && !student.freeIdCard) {
      student = await basePrisma.user.update({
        where: { id: student.id },
        data: { freeIdCard: true },
      });
    }

    await sendStudentEnrolledNotice({
      to: email,
      studentName: student.name,
      instituteName: tenantName,
      classTitle,
      loginUrl: `${env.clientUrl}/login`,
      tenantId,
      relatedId: enrollment.id,
    });

    return { enrollment, student, invited: false };
  }

  const profileData = {
    name: data.name.trim(),
    phone: primaryPhone,
    phones,
    guardianName: data.guardianName?.trim() || null,
    guardianPhone: data.guardianPhone?.trim() || null,
    area: data.area?.trim() || null,
    district: data.district || null,
    school: data.school?.trim() || null,
    address: data.address?.trim() || null,
    freeIdCard,
  };

  // New or incomplete student — create/update profile, then send invite.
  if (!student) {
    student = await basePrisma.user.create({
      data: {
        tenantId,
        email,
        role: 'student',
        status: 'pending',
        ...profileData,
      },
    });
  } else {
    student = await basePrisma.user.update({
      where: { id: student.id },
      data: {
        name: profileData.name,
        phone: primaryPhone || student.phone,
        phones: phones.length > 0 ? phones : student.phones,
        guardianName: profileData.guardianName || student.guardianName,
        guardianPhone: profileData.guardianPhone || student.guardianPhone,
        area: profileData.area || student.area,
        district: profileData.district || student.district,
        school: profileData.school || student.school,
        address: profileData.address || student.address,
        freeIdCard: freeIdCard || student.freeIdCard,
      },
    });
  }

  let enrollment = await basePrisma.enrollment.findFirst({
    where: { classId, studentId: student.id },
  });
  if (!enrollment) {
    enrollment = await basePrisma.enrollment.create({
      data: { tenantId, classId, studentId: student.id, status, feeWaiverAmount },
    });
  } else {
    enrollment = await basePrisma.enrollment.update({
      where: { id: enrollment.id },
      data: { feeWaiverAmount },
    });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const invite = await basePrisma.studentInvite.create({
    data: {
      tenantId,
      classId,
      token: hashToken(token),
      email,
      name: data.name.trim(),
      phone: primaryPhone,
      phones,
      guardianName: data.guardianName?.trim() || null,
      guardianPhone: data.guardianPhone?.trim() || null,
      area: data.area?.trim() || null,
      district: data.district || null,
      school: data.school?.trim() || null,
      address: data.address?.trim() || null,
      freeIdCard,
      feeWaiverAmount,
      invitedById,
      userId: student.id,
      expiresAt,
    },
  });

  const url = inviteUrl(tenantSlug, token);
  await sendStudentClassInvite({
    to: email,
    studentName: data.name.trim(),
    instituteName: tenantName,
    classTitle,
    inviteUrl: url,
    tenantId,
    relatedId: invite.id,
  });

  return { enrollment, student, invited: true, inviteUrl: url };
}

export async function enrollExistingStudentInClass(opts: {
  tenantId: string;
  tenantName: string;
  classId: string;
  classTitle: string;
  studentId: string;
  freeIdCard?: boolean;
  feeWaiverAmount?: number;
}) {
  const { tenantId, tenantName, classId, classTitle, studentId, freeIdCard } = opts;

  let student = await basePrisma.user.findFirst({
    where: { id: studentId, tenantId, role: 'student' },
  });
  if (!student) throw notFound('Student not found');

  if (freeIdCard && !student.freeIdCard) {
    student = await basePrisma.user.update({
      where: { id: student.id },
      data: { freeIdCard: true },
    });
  }

  const existing = await basePrisma.enrollment.findFirst({
    where: { classId, studentId: student.id },
  });
  if (existing?.status === 'active') {
    throw conflict('This student is already enrolled in this class');
  }

  const klass = await basePrisma.class.findFirst({
    where: { id: classId, tenantId },
    select: { price: true },
  });
  const feeWaiverAmount = clampFeeWaiver(klass?.price ?? 0, opts.feeWaiverAmount ?? 0);
  const status = enrollmentStatusForNetFee(klass?.price ?? 0, feeWaiverAmount);

  let enrollment = existing;
  if (!enrollment) {
    enrollment = await basePrisma.enrollment.create({
      data: {
        tenantId,
        classId,
        studentId: student.id,
        status,
        feeWaiverAmount,
      },
    });
  } else {
    enrollment = await basePrisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status, feeWaiverAmount },
    });
  }

  if (student.passwordHash) {
    await sendStudentEnrolledNotice({
      to: student.email,
      studentName: student.name,
      instituteName: tenantName,
      classTitle,
      loginUrl: `${env.clientUrl}/login`,
      tenantId,
      relatedId: enrollment.id,
    });
  }

  return {
    enrollment,
    student,
    invited: false,
    pendingRegistration: !student.passwordHash,
  };
}

export async function getInviteForToken(tenantId: string, token: string) {
  const include = {
    class: { select: { title: true, price: true } },
    tenant: { select: { name: true, slug: true } },
  } as const;
  const invite =
    (await basePrisma.studentInvite.findFirst({ where: { tenantId, token: hashToken(token) }, include })) ??
    (await basePrisma.studentInvite.findFirst({ where: { tenantId, token }, include }));
  if (!invite) throw notFound('Invitation not found');
  if (invite.usedAt) throw badRequest('This invitation has already been used');
  if (invite.expiresAt < new Date()) throw badRequest('This invitation has expired');

  const phones = normalizePhones(invite.phones, invite.phone);
  const classPrice = Number(invite.class?.price ?? 0);
  const feeWaiverAmount = Number(invite.feeWaiverAmount ?? 0);

  return {
    invite: {
      email: invite.email,
      name: invite.name,
      phone: phones[0] ?? '',
      phones,
      guardianName: invite.guardianName ?? '',
      guardianPhone: invite.guardianPhone ?? '',
      area: invite.area ?? '',
      district: invite.district ?? '',
      school: invite.school ?? '',
      address: invite.address ?? '',
      freeIdCard: invite.freeIdCard,
      feeWaiverAmount,
      classPrice,
      netFee: Math.max(0, classPrice - feeWaiverAmount),
      classTitle: invite.class?.title ?? null,
      instituteName: invite.tenant.name,
    },
  };
}

export async function acceptInvite(tenantId: string, token: string, data: OnboardingInput) {
  const include = { user: true } as const;
  const invite =
    (await basePrisma.studentInvite.findFirst({ where: { tenantId, token: hashToken(token) }, include })) ??
    (await basePrisma.studentInvite.findFirst({ where: { tenantId, token }, include }));
  if (!invite) throw notFound('Invitation not found');
  if (invite.usedAt) throw badRequest('This invitation has already been used');
  if (invite.expiresAt < new Date()) throw badRequest('This invitation has expired');
  if (!invite.userId) throw badRequest('Invalid invitation');

  const phones = normalizePhones(data.phones, data.phone);
  if (phones.length === 0) throw badRequest('At least one telephone number is required');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const student = await basePrisma.user.update({
    where: { id: invite.userId },
    data: {
      phone: phones[0],
      phones,
      guardianName: data.guardianName.trim(),
      guardianPhone: data.guardianPhone.trim(),
      area: data.area.trim(),
      district: data.district,
      school: data.school?.trim() || null,
      address: data.address.trim(),
      freeIdCard: invite.freeIdCard,
      passwordHash,
      status: 'approved',
    },
  });

  if (invite.classId) {
    const klass = await basePrisma.class.findFirst({
      where: { id: invite.classId, tenantId },
      select: { price: true },
    });
    const feeWaiverAmount = clampFeeWaiver(klass?.price ?? 0, invite.feeWaiverAmount ?? 0);
    const status = enrollmentStatusForNetFee(klass?.price ?? 0, feeWaiverAmount);
    await basePrisma.enrollment.updateMany({
      where: { classId: invite.classId, studentId: student.id },
      data: { status, feeWaiverAmount },
    });
  }

  await basePrisma.studentInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  return { student };
}
