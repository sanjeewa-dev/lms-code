import { prisma, basePrisma } from '../lib/prisma';
import { enrollmentStatusForNetFee, netClassFee } from '../lib/fees';
import { forbidden } from '../utils/httpError';
import type { Role } from '@prisma/client';

export function currentBillingMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Students need an active enrollment. For paid classes, when the institute
 * requires monthly payment, they also need an approved payment for the current
 * month — unless still within the tenant's grace period at the start of the month.
 */
export async function studentHasContentAccess(opts: {
  tenantId: string;
  classId: string;
  studentId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { classId: opts.classId, studentId: opts.studentId },
    include: {
      class: { select: { price: true, teacherId: true } },
    },
  });

  if (!enrollment || enrollment.status !== 'active') {
    return { ok: false, reason: 'You must have an approved enrollment to access this class' };
  }

  const price = netClassFee(enrollment.class.price, enrollment.feeWaiverAmount);
  if (price <= 0) return { ok: true };

  const tenant = await basePrisma.tenant.findFirst({
    where: { id: opts.tenantId },
    select: { requireMonthlyPayment: true, graceDays: true },
  });

  if (!tenant?.requireMonthlyPayment) return { ok: true };

  const now = new Date();
  const month = currentBillingMonth(now);
  const dayOfMonth = now.getDate();
  const graceDays = tenant.graceDays ?? 7;

  const approvedThisMonth = await prisma.payment.findFirst({
    where: {
      enrollmentId: enrollment.id,
      forMonth: month,
      status: 'approved',
    },
  });

  if (approvedThisMonth) return { ok: true };

  // Within grace period: allow access while waiting for this month's payment.
  if (dayOfMonth <= graceDays) return { ok: true };

  return {
    ok: false,
    reason: `Payment for ${month} is required to access class content. Please upload your monthly fee slip.`,
  };
}

export async function assertStudentContentAccess(opts: {
  tenantId: string;
  classId: string;
  userId: string;
  role: Role;
  teacherId?: string;
}) {
  if (opts.role === 'superadmin' || opts.role === 'admin') return;
  if (opts.role === 'teacher') {
    if (opts.teacherId && opts.teacherId === opts.userId) return;
    const klass = await prisma.class.findFirst({
      where: { id: opts.classId },
      select: { teacherId: true },
    });
    if (klass?.teacherId === opts.userId) return;
  }

  const access = await studentHasContentAccess({
    tenantId: opts.tenantId,
    classId: opts.classId,
    studentId: opts.userId,
  });
  if (!access.ok) throw forbidden(access.reason ?? 'Access denied');
}

/**
 * Paid material unlock: free materials use class content access;
 * priced materials require an approved material payment for this enrollment.
 */
export async function studentHasMaterialAccess(opts: {
  tenantId: string;
  materialId: string;
  studentId: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  purchaseStatus: 'none' | 'pending' | 'approved' | 'rejected';
}> {
  const material = await prisma.material.findFirst({
    where: { id: opts.materialId, tenantId: opts.tenantId },
    select: {
      id: true,
      classId: true,
      price: true,
      published: true,
      kind: true,
    },
  });
  if (!material) {
    return { ok: false, reason: 'Material not found', purchaseStatus: 'none' };
  }

  const classAccess = await studentHasContentAccess({
    tenantId: opts.tenantId,
    classId: material.classId,
    studentId: opts.studentId,
  });
  if (!classAccess.ok) {
    return { ok: false, reason: classAccess.reason, purchaseStatus: 'none' };
  }

  const price = Number(material.price);
  if (price <= 0) {
    return { ok: true, purchaseStatus: 'none' };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      classId: material.classId,
      studentId: opts.studentId,
      status: 'active',
    },
    select: { id: true },
  });
  if (!enrollment) {
    return { ok: false, reason: 'You must be enrolled in this class', purchaseStatus: 'none' };
  }

  const payment = await prisma.payment.findFirst({
    where: {
      materialId: material.id,
      enrollmentId: enrollment.id,
      paymentType: 'material',
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });

  const purchaseStatus = payment
    ? (payment.status as 'pending' | 'approved' | 'rejected')
    : 'none';

  if (purchaseStatus === 'approved') {
    return { ok: true, purchaseStatus };
  }

  return {
    ok: false,
    reason:
      purchaseStatus === 'pending'
        ? 'Your payment slip for this material is pending approval.'
        : 'Purchase this material from Payments to unlock the full preview.',
    purchaseStatus,
  };
}

export async function getMaterialPurchaseStatus(opts: {
  materialId: string;
  enrollmentId: string;
}): Promise<'none' | 'pending' | 'approved' | 'rejected'> {
  const payment = await prisma.payment.findFirst({
    where: {
      materialId: opts.materialId,
      enrollmentId: opts.enrollmentId,
      paymentType: 'material',
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  });
  if (!payment) return 'none';
  return payment.status as 'pending' | 'approved' | 'rejected';
}

/** Initial enrollment status: free/fully waived → active, otherwise pending. */
export async function enrollmentStatusForClass(
  classId: string,
  feeWaiverAmount: number | string = 0
): Promise<'active' | 'pending'> {
  const klass = await prisma.class.findFirst({
    where: { id: classId },
    select: { price: true },
  });
  return enrollmentStatusForNetFee(klass?.price ?? 0, feeWaiverAmount);
}
