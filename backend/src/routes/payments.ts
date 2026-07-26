import { Router } from 'express';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadSlip } from '../middleware/upload';
import { persistUploadedFile } from '../services/files';
import { paymentSchema, reviewPaymentSchema, payhereInitSchema } from '../validation/schemas';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { storage } from '../services/storage';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

const PAYMENT_INCLUDE = {
  enrollment: {
    include: {
      student: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
      class: { select: { id: true, title: true, price: true, teacherId: true } },
    },
  },
  reviewedBy: { select: { id: true, name: true } },
} as const;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(forMonth: string) {
  const [year, month] = forMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function serializePayment(p: any, studentRegId?: string) {
  return {
    id: p.id,
    enrollmentId: p.enrollmentId,
    amount: Number(p.amount),
    paymentType: p.paymentType,
    forMonth: p.forMonth,
    forMonthLabel: formatMonthLabel(p.forMonth),
    status: p.status,
    note: p.note,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
    reviewedBy: p.reviewedBy ?? null,
    enrollment: p.enrollment
      ? {
          id: p.enrollment.id,
          status: p.enrollment.status,
          student: {
            ...p.enrollment.student,
            regId: studentRegId ?? null,
            phone: p.enrollment.student.phone ?? null,
          },
          class: {
            ...p.enrollment.class,
            price: Number(p.enrollment.class.price),
          },
        }
      : undefined,
  };
}

async function buildStudentRegIdMap(tenantId: string) {
  const students = await basePrisma.user.findMany({
    where: { tenantId, role: 'student' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return new Map(students.map((s, i) => [s.id, `#${students.length - i}`]));
}

async function assertNoDuplicatePayment(enrollmentId: string, forMonth: string) {
  const existing = await prisma.payment.findFirst({
    where: {
      enrollmentId,
      forMonth,
      status: { in: ['pending', 'approved'] },
    },
  });
  if (existing) {
    throw badRequest(
      existing.status === 'pending'
        ? `You already have a pending payment for ${formatMonthLabel(forMonth)}`
        : `Payment for ${formatMonthLabel(forMonth)} is already approved`
    );
  }
}

router.post(
  '/enrollments/:enrollmentId/payment',
  authenticate,
  requireRole('student'),
  uploadSlip,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A payment slip file is required');

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: req.params.enrollmentId },
      include: { class: { select: { price: true } } },
    });
    if (!enrollment) throw notFound('Enrollment not found');
    if (enrollment.studentId !== req.user!.sub) {
      throw forbidden('You can only pay for your own enrollment');
    }

    const data = paymentSchema.parse(req.body);
    await assertNoDuplicatePayment(enrollment.id, data.forMonth);

    const paymentType = enrollment.status === 'active' ? 'monthly' : 'enrollment';
    const amount = Number(enrollment.class.price);

    if (paymentType === 'enrollment' && enrollment.status === 'rejected') {
      throw badRequest('Your enrollment was rejected. Please contact your institute.');
    }

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');

    const payment = await prisma.payment.create({
      data: {
        tenantId: req.tenant!.id,
        enrollmentId: enrollment.id,
        amount,
        slipFileId: slip.id,
        paymentType,
        forMonth: data.forMonth,
        status: 'pending',
      },
      include: PAYMENT_INCLUDE,
    });

    if (paymentType === 'enrollment' && enrollment.status !== 'active') {
      await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: 'pending' } });
    }

    res.status(201).json({ payment: serializePayment(payment) });
  })
);

router.get(
  '/payments/mine',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const forMonth = (req.query.forMonth as string) || undefined;
    const payments = await prisma.payment.findMany({
      where: {
        enrollment: { studentId: req.user!.sub },
        ...(forMonth ? { forMonth } : {}),
      },
      include: PAYMENT_INCLUDE,
      orderBy: [{ forMonth: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ payments: payments.map((p) => serializePayment(p)) });
  })
);

router.get(
  '/payments/my-status',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const forMonth = (req.query.forMonth as string) || currentMonth();

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user!.sub, status: { in: ['pending', 'active'] } },
      include: {
        class: { select: { id: true, title: true, price: true } },
        payments: {
          where: { forMonth },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      forMonth,
      forMonthLabel: formatMonthLabel(forMonth),
      enrollments: enrollments.map((e) => ({
        enrollmentId: e.id,
        enrollmentStatus: e.status,
        class: { ...e.class, price: Number(e.class.price) },
        payment: e.payments[0] ? serializePayment({ ...e.payments[0], enrollment: undefined }) : null,
      })),
    });
  })
);

router.get(
  '/payments',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || undefined;
    const forMonth = (req.query.forMonth as string) || undefined;
    const classId = (req.query.classId as string) || undefined;

    const where: any = {};
    if (status) where.status = status;
    if (forMonth) where.forMonth = forMonth;
    if (classId) where.enrollment = { classId };

    if (req.user!.role === 'teacher') {
      where.enrollment = { ...(where.enrollment ?? {}), class: { teacherId: req.user!.sub } };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: PAYMENT_INCLUDE,
      orderBy: [{ forMonth: 'desc' }, { createdAt: 'desc' }],
    });

    const regIdMap = await buildStudentRegIdMap(req.tenant!.id);
    res.json({
      payments: payments.map((p) =>
        serializePayment(p, regIdMap.get(p.enrollment.student.id))
      ),
    });
  })
);

router.get(
  '/payments/summary',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const forMonth = (req.query.forMonth as string) || currentMonth();
    const baseWhere: any = { forMonth };
    if (req.user!.role === 'teacher') {
      baseWhere.enrollment = { class: { teacherId: req.user!.sub } };
    }

    const [total, approved, pending, rejected] = await Promise.all([
      prisma.payment.count({ where: baseWhere }),
      prisma.payment.count({ where: { ...baseWhere, status: 'approved' } }),
      prisma.payment.count({ where: { ...baseWhere, status: 'pending' } }),
      prisma.payment.count({ where: { ...baseWhere, status: 'rejected' } }),
    ]);

    res.json({
      forMonth,
      forMonthLabel: formatMonthLabel(forMonth),
      total,
      approved,
      pending,
      rejected,
    });
  })
);

router.get(
  '/payments/pending-count',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const where: any = { status: 'pending' };
    if (req.user!.role === 'teacher') {
      where.enrollment = { class: { teacherId: req.user!.sub } };
    }
    const count = await prisma.payment.count({ where });
    res.json({ count });
  })
);

router.get(
  '/payments/:paymentId/slip',
  authenticate,
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.paymentId },
      include: {
        slipFile: true,
        enrollment: { include: { class: { select: { teacherId: true } } } },
      },
    });
    if (!payment) throw notFound('Payment not found');

    const user = req.user!;
    const isOwnerStudent = payment.enrollment.studentId === user.sub;
    const isClassTeacher = payment.enrollment.class.teacherId === user.sub;
    if (user.role === 'student' && !isOwnerStudent) throw forbidden('Not allowed to view this slip');
    if (user.role === 'teacher' && !isClassTeacher) throw forbidden('Not allowed to view this slip');

    res.setHeader('Content-Type', payment.slipFile.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    storage.createReadStream(payment.slipFile.storageKey).pipe(res);
  })
);

async function reviewPayment(paymentId: string, reviewerId: string, approve: boolean, note?: string) {
  const targetStatus = approve ? 'approved' : 'rejected';

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: {
      enrollment: {
        include: {
          student: { select: { id: true } },
          class: { select: { title: true, teacherId: true } },
        },
      },
    },
  });
  if (!payment) throw notFound('Payment not found');

  if (payment.status !== 'pending') {
    if (payment.status === targetStatus) return payment;
    throw badRequest('This payment has already been reviewed');
  }

  const updatedPayment = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: targetStatus,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        note,
      },
    });

    if (payment.paymentType === 'enrollment') {
      await tx.enrollment.update({
        where: { id: payment.enrollmentId },
        data: { status: approve ? 'active' : 'rejected' },
      });
    }

    return updated;
  });

  await createNotification({
    tenantId: payment.tenantId,
    userId: payment.enrollment.studentId,
    type: approve ? 'payment_approved' : 'payment_rejected',
    title: approve ? 'Payment approved' : 'Payment rejected',
    body: approve
      ? `Your payment for ${payment.enrollment.class.title} (${payment.forMonth}) was approved.`
      : `Your payment for ${payment.enrollment.class.title} (${payment.forMonth}) was rejected.${note ? ` Note: ${note}` : ''}`,
    link: '/payments',
  });

  return updatedPayment;
}

function ensureCanReview(req: any, teacherId: string) {
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return;
  if (teacherId === req.user.sub) return;
  throw forbidden('You can only review payments for your own classes');
}

router.post(
  '/payments/:paymentId/approve',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = reviewPaymentSchema.parse(req.body ?? {});
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.paymentId },
      include: { enrollment: { include: { class: true } } },
    });
    if (!payment) throw notFound('Payment not found');
    ensureCanReview(req, payment.enrollment.class.teacherId);
    const updated = await reviewPayment(payment.id, req.user!.sub, true, data.note);
    res.json({ payment: serializePayment({ ...updated, enrollment: payment.enrollment }) });
  })
);

router.post(
  '/payments/:paymentId/reject',
  authenticate,
  requireRole('admin', 'teacher', 'superadmin'),
  asyncHandler(async (req, res) => {
    const data = reviewPaymentSchema.parse(req.body ?? {});
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.paymentId },
      include: { enrollment: { include: { class: true } } },
    });
    if (!payment) throw notFound('Payment not found');
    ensureCanReview(req, payment.enrollment.class.teacherId);
    const updated = await reviewPayment(payment.id, req.user!.sub, false, data.note);
    res.json({ payment: serializePayment({ ...updated, enrollment: payment.enrollment }) });
  })
);

router.post(
  '/payments/payhere/init',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = payhereInitSchema.parse(req.body);
    const tenant = await basePrisma.tenant.findFirst({ where: { id: req.tenant!.id } });
    if (!tenant?.payhereEnabled || !tenant.payhereMerchantId) {
      throw badRequest('Online payments are not enabled for this institute');
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: data.enrollmentId, studentId: req.user!.sub },
      include: {
        class: { select: { title: true, price: true } },
        student: { select: { name: true, email: true, phone: true } },
      },
    });
    if (!enrollment) throw notFound('Enrollment not found');

    await assertNoDuplicatePayment(enrollment.id, data.forMonth);
    const amount = Number(enrollment.class.price).toFixed(2);
    const orderId = `ph_${enrollment.id}_${data.forMonth}_${Date.now()}`;

    // Sandbox checkout fields — institute completes payment on PayHere hosted page.
    res.json({
      checkout: {
        sandbox: true,
        action: 'https://sandbox.payhere.lk/pay/checkout',
        merchant_id: tenant.payhereMerchantId,
        return_url: `${process.env.CLIENT_URL ?? 'http://localhost:5173'}/${req.params.slug}/payments`,
        cancel_url: `${process.env.CLIENT_URL ?? 'http://localhost:5173'}/${req.params.slug}/payments`,
        notify_url: `${process.env.API_PUBLIC_URL ?? 'http://localhost:4000'}/api/t/${req.params.slug}/payments/payhere/notify`,
        order_id: orderId,
        items: `${enrollment.class.title} (${data.forMonth})`,
        currency: 'LKR',
        amount,
        first_name: enrollment.student.name.split(' ')[0] || enrollment.student.name,
        last_name: enrollment.student.name.split(' ').slice(1).join(' ') || 'Student',
        email: enrollment.student.email,
        phone: enrollment.student.phone || '0700000000',
        address: 'Sri Lanka',
        city: 'Colombo',
        country: 'Sri Lanka',
        custom_1: enrollment.id,
        custom_2: data.forMonth,
      },
    });
  })
);

export default router;
