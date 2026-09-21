import { Router } from 'express';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadSlip } from '../middleware/upload';
import { persistUploadedFile } from '../services/files';
import { env } from '../config/env';
import {
  paymentSchema,
  multiPaymentSchema,
  reviewPaymentSchema,
  payhereInitSchema,
  staffPaymentSlipSchema,
  materialPaymentSlipSchema,
} from '../validation/schemas';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError';
import { storage } from '../services/storage';
import { createNotification } from '../services/notifications';
import { netClassFee } from '../lib/fees';
import {
  createMaterialOrderFromPayments,
  syncMaterialOrderFromPaymentReview,
} from '../services/materialOrders';

const router = Router({ mergeParams: true });

const PAYMENT_INCLUDE = {
  enrollment: {
    include: {
      student: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
      class: { select: { id: true, title: true, price: true, teacherId: true } },
    },
  },
  material: {
    select: { id: true, title: true, price: true, classId: true },
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
  const student = p.enrollment?.student;
  return {
    id: p.id,
    enrollmentId: p.enrollmentId,
    materialId: p.materialId ?? null,
    amount: Number(p.amount),
    paymentType: p.paymentType,
    forMonth: p.forMonth,
    forMonthLabel: formatMonthLabel(p.forMonth),
    status: p.status,
    note: p.note,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
    reviewedBy: p.reviewedBy ?? null,
    material: p.material
      ? {
          id: p.material.id,
          title: p.material.title,
          price: Number(p.material.price),
          classId: p.material.classId,
        }
      : null,
    enrollment: p.enrollment
      ? {
          id: p.enrollment.id,
          status: p.enrollment.status,
          student: student
            ? {
                ...student,
                regId: studentRegId ?? null,
                phone: student.phone ?? null,
              }
            : null,
          class: p.enrollment.class
            ? {
                ...p.enrollment.class,
                price: Number(p.enrollment.class.price),
              }
            : null,
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

async function assertNoDuplicatePayment(
  enrollmentId: string,
  forMonth: string,
  paymentType: 'enrollment' | 'monthly'
) {
  const existing = await prisma.payment.findFirst({
    where: {
      enrollmentId,
      forMonth,
      paymentType,
      status: { in: ['pending', 'approved'] },
    },
  });
  if (existing) {
    throw conflict(
      existing.status === 'pending'
        ? `You already have a pending ${paymentType} payment for ${formatMonthLabel(forMonth)}`
        : `A ${paymentType} payment for ${formatMonthLabel(forMonth)} is already approved`
    );
  }
}

async function assertNoDuplicateMaterialPayment(enrollmentId: string, materialId: string) {
  const existing = await prisma.payment.findFirst({
    where: {
      enrollmentId,
      materialId,
      paymentType: 'material',
      status: { in: ['pending', 'approved'] },
    },
  });
  if (existing) {
    throw conflict(
      existing.status === 'pending'
        ? 'You already have a pending payment for this material'
        : 'This material is already purchased'
    );
  }
}

function paymentTypeForEnrollment(status: string): 'enrollment' | 'monthly' {
  return status === 'active' ? 'monthly' : 'enrollment';
}

function mapPaymentCreateConflict(err: unknown, forMonth: string, paymentType: 'enrollment' | 'monthly'): never {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
    throw conflict(
      `A pending or approved ${paymentType} payment already exists for ${formatMonthLabel(forMonth)}`
    );
  }
  throw err;
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
    const paymentType = paymentTypeForEnrollment(enrollment.status);
    await assertNoDuplicatePayment(enrollment.id, data.forMonth, paymentType);

    const amount = netClassFee(enrollment.class.price, enrollment.feeWaiverAmount);

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');

    let payment;
    try {
      payment = await prisma.payment.create({
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
    } catch (err) {
      mapPaymentCreateConflict(err, data.forMonth, paymentType);
    }

    if (paymentType === 'enrollment' && enrollment.status !== 'active') {
      await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: 'pending' } });
    }

    res.status(201).json({ payment: serializePayment(payment) });
  })
);

/** Upload one slip that covers multiple class enrollments for the same billing month. */
router.post(
  '/payments/slip',
  authenticate,
  requireRole('student'),
  uploadSlip,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A payment slip file is required');

    const data = multiPaymentSchema.parse({
      forMonth: req.body?.forMonth,
      enrollmentIds: req.body?.enrollmentIds,
    });
    const enrollmentIds = [...new Set(data.enrollmentIds)];
    const enrollments = await prisma.enrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        studentId: req.user!.sub,
        status: { in: ['active', 'pending'] },
      },
      include: { class: { select: { id: true, title: true, price: true } } },
    });
    if (enrollments.length !== enrollmentIds.length) {
      throw badRequest('One or more selected classes were not found in your enrollments');
    }
    for (const enrollment of enrollments) {
      await assertNoDuplicatePayment(
        enrollment.id,
        data.forMonth,
        paymentTypeForEnrollment(enrollment.status)
      );
    }

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');
    let payments;
    try {
      payments = await prisma.$transaction(
        enrollments.map((enrollment) =>
          prisma.payment.create({
            data: {
              tenantId: req.tenant!.id,
              enrollmentId: enrollment.id,
              amount: netClassFee(enrollment.class.price, enrollment.feeWaiverAmount),
              slipFileId: slip.id,
              paymentType: paymentTypeForEnrollment(enrollment.status),
              forMonth: data.forMonth,
              status: 'pending',
            },
            include: PAYMENT_INCLUDE,
          })
        )
      );
    } catch (err) {
      mapPaymentCreateConflict(err, data.forMonth, 'monthly');
    }

    const serializedPayments = payments.map((payment) => serializePayment(payment));
    res.status(201).json({
      payments: serializedPayments,
      total: serializedPayments.reduce((sum, payment) => sum + payment.amount, 0),
      forMonth: data.forMonth,
      forMonthLabel: formatMonthLabel(data.forMonth),
      classCount: serializedPayments.length,
    });
  })
);

/** Student: list paid materials available to purchase across enrolled classes. */
router.get(
  '/payments/materials/status',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user!.sub, status: 'active' },
      include: {
        class: { select: { id: true, title: true } },
      },
    });
    const classIds = enrollments.map((e) => e.classId);
    const enrollmentByClass = new Map(enrollments.map((e) => [e.classId, e]));

    const materials = classIds.length
      ? await prisma.material.findMany({
          where: {
            classId: { in: classIds },
            kind: 'material',
            published: true,
            price: { gt: 0 },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            classId: true,
            pageCount: true,
            fileId: true,
            createdAt: true,
          },
        })
      : [];

    const enrollmentIds = enrollments.map((e) => e.id);
    const payments = enrollmentIds.length
      ? await prisma.payment.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            paymentType: 'material',
            materialId: { in: materials.map((m) => m.id) },
          },
          include: PAYMENT_INCLUDE,
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const paymentByMaterial = new Map<string, (typeof payments)[number]>();
    for (const p of payments) {
      if (p.materialId && !paymentByMaterial.has(p.materialId)) {
        paymentByMaterial.set(p.materialId, p);
      }
    }

    res.json({
      items: materials.map((m) => {
        const enrollment = enrollmentByClass.get(m.classId)!;
        const payment = paymentByMaterial.get(m.id) ?? null;
        const status = payment
          ? (payment.status as 'pending' | 'approved' | 'rejected')
          : 'none';
        return {
          materialId: m.id,
          title: m.title,
          description: m.description,
          price: Number(m.price),
          pageCount: m.pageCount,
          hasFile: Boolean(m.fileId),
          classId: m.classId,
          classTitle: enrollment.class.title,
          enrollmentId: enrollment.id,
          purchaseStatus: status,
          canPreview: status === 'approved',
          payment: payment ? serializePayment(payment) : null,
        };
      }),
    });
  })
);

/** Student: upload one slip covering one or more paid materials. */
router.post(
  '/payments/materials/slip',
  authenticate,
  requireRole('student'),
  uploadSlip,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A payment slip file is required');
    const data = materialPaymentSlipSchema.parse({
      materialIds: req.body?.materialIds,
    });
    const uniqueIds = [...new Set(data.materialIds)];

    const materials = await prisma.material.findMany({
      where: {
        id: { in: uniqueIds },
        kind: 'material',
        published: true,
        price: { gt: 0 },
      },
      select: {
        id: true,
        title: true,
        price: true,
        classId: true,
      },
    });
    if (materials.length !== uniqueIds.length) {
      throw badRequest('One or more selected materials were not found or are not purchasable');
    }

    const classIds = [...new Set(materials.map((m) => m.classId))];
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: req.user!.sub,
        classId: { in: classIds },
        status: 'active',
      },
      select: {
        id: true,
        classId: true,
        class: {
          select: {
            id: true,
            title: true,
            batch: { select: { name: true } },
          },
        },
      },
    });
    const enrollmentByClass = new Map(enrollments.map((e) => [e.classId, e]));

    for (const m of materials) {
      const enrollment = enrollmentByClass.get(m.classId);
      if (!enrollment) {
        throw forbidden(`You must be enrolled in the class to purchase "${m.title}"`);
      }
      await assertNoDuplicateMaterialPayment(enrollment.id, m.id);
    }

    const student = await prisma.user.findFirst({
      where: { id: req.user!.sub },
      select: { name: true, email: true, phone: true, address: true },
    });
    if (!student) throw notFound('Student not found');
    const phone = (student.phone ?? '').trim();
    const address = (student.address ?? '').trim();
    if (!phone || !address) {
      throw badRequest('Please confirm your phone and delivery address before submitting a material order');
    }

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');
    const forMonth = currentMonth();

    let payments;
    try {
      payments = await prisma.$transaction(
        materials.map((m) => {
          const enrollment = enrollmentByClass.get(m.classId)!;
          return prisma.payment.create({
            data: {
              tenantId: req.tenant!.id,
              enrollmentId: enrollment.id,
              materialId: m.id,
              amount: m.price,
              slipFileId: slip.id,
              paymentType: 'material',
              forMonth,
              status: 'pending',
            },
            include: {
              ...PAYMENT_INCLUDE,
              material: { select: { id: true, title: true, price: true, classId: true } },
              enrollment: {
                include: {
                  student: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
                  class: {
                    select: {
                      id: true,
                      title: true,
                      price: true,
                      teacherId: true,
                      batch: { select: { name: true } },
                    },
                  },
                },
              },
            },
          });
        })
      );
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
        throw conflict('A pending or approved payment already exists for one of these materials');
      }
      throw err;
    }

    const orderPayments = payments.map((p) => ({
      id: p.id,
      materialId: p.materialId!,
      amount: p.amount,
      material: p.material!,
      enrollment: {
        class: {
          id: p.enrollment.class.id,
          title: p.enrollment.class.title,
          batch: (p.enrollment.class as any).batch ?? null,
        },
      },
    }));

    const order = await createMaterialOrderFromPayments({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      slipFileId: slip.id,
      payments: orderPayments,
      recipient: {
        name: student.name,
        email: student.email,
        phone,
        address,
      },
    });

    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    res.status(201).json({
      payments: payments.map((p) => serializePayment(p)),
      total,
      materialCount: payments.length,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
      },
    });
  })
);

/** Replace the slip on a pending payment (e.g. student uploaded the wrong file). */
router.patch(
  '/payments/:paymentId/slip',
  authenticate,
  requireRole('student'),
  uploadSlip,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A payment slip file is required');

    const payment = await prisma.payment.findFirst({
      where: { id: req.params.paymentId },
      include: { enrollment: { select: { studentId: true } } },
    });
    if (!payment) throw notFound('Payment not found');
    if (payment.enrollment.studentId !== req.user!.sub) {
      throw forbidden('You can only update your own payments');
    }
    if (payment.status !== 'pending') {
      throw badRequest(
        payment.status === 'rejected'
          ? 'This payment was rejected. Upload a new slip from the payments list instead.'
          : 'Approved payments cannot be changed.'
      );
    }

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');
    const oldSlipFileId = payment.slipFileId;

    const siblings = await prisma.payment.findMany({
      where: {
        slipFileId: oldSlipFileId,
        status: 'pending',
        enrollment: { studentId: req.user!.sub },
      },
      select: { id: true },
    });

    await prisma.$transaction(
      siblings.map((p) =>
        prisma.payment.update({
          where: { id: p.id },
          data: { slipFileId: slip.id, reviewedAt: null, reviewedById: null, note: null },
        })
      )
    );

    await prisma.materialOrder.updateMany({
      where: {
        slipFileId: oldSlipFileId,
        studentId: req.user!.sub,
        status: 'approval_pending',
      },
      data: { slipFileId: slip.id },
    });

    const stillUsed = await prisma.payment.count({ where: { slipFileId: oldSlipFileId } });
    const orderStillUses = await prisma.materialOrder.count({ where: { slipFileId: oldSlipFileId } });
    if (stillUsed === 0 && orderStillUses === 0) {
      const oldFile = await prisma.file.findFirst({ where: { id: oldSlipFileId } });
      if (oldFile) {
        await storage.remove(oldFile.storageKey).catch(() => undefined);
        await prisma.file.delete({ where: { id: oldFile.id } }).catch(() => undefined);
      }
    }

    const updated = await prisma.payment.findFirst({
      where: { id: payment.id },
      include: PAYMENT_INCLUDE,
    });
    res.json({ payment: serializePayment(updated), replacedCount: siblings.length });
  })
);

/** Staff may record an externally received slip for an eligible student. */
router.post(
  '/payments/staff-slip',
  authenticate,
  requireRole('teacher', 'admin', 'superadmin'),
  uploadSlip,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A payment slip file is required');
    const data = staffPaymentSlipSchema.parse(req.body);
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: data.enrollmentId, status: { in: ['active', 'pending'] } },
      include: {
        class: { select: { id: true, title: true, price: true, teacherId: true } },
        student: { select: { id: true } },
      },
    });
    if (!enrollment) throw notFound('Enrollment not found');
    if (req.user!.role === 'teacher' && enrollment.class.teacherId !== req.user!.sub) {
      throw forbidden('You can only upload slips for students in your own classes');
    }
    const paymentType = paymentTypeForEnrollment(enrollment.status);
    await assertNoDuplicatePayment(enrollment.id, data.forMonth, paymentType);

    const slip = await persistUploadedFile(req.file, req.user!.sub, 'slip');
    let payment;
    try {
      payment = await prisma.payment.create({
        data: {
          tenantId: req.tenant!.id,
          enrollmentId: enrollment.id,
          amount: netClassFee(enrollment.class.price, enrollment.feeWaiverAmount),
          slipFileId: slip.id,
          paymentType,
          forMonth: data.forMonth,
          status: 'pending',
          note: 'Slip uploaded by staff on behalf of the student.',
        },
        include: PAYMENT_INCLUDE,
      });
    } catch (err) {
      mapPaymentCreateConflict(err, data.forMonth, paymentType);
    }
    await createNotification({
      tenantId: req.tenant!.id,
      userId: enrollment.student.id,
      type: 'general',
      title: 'Payment slip submitted',
      body: `A payment slip for ${enrollment.class.title} (${formatMonthLabel(data.forMonth)}) was submitted on your behalf.`,
      link: '/payments',
    });
    res.status(201).json({ payment: serializePayment(payment) });
  })
);

router.get(
  '/payments/mine',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const forMonth = (req.query.forMonth as string) || undefined;
    const paymentType = (req.query.paymentType as string) || undefined;
    const payments = await prisma.payment.findMany({
      where: {
        enrollment: { studentId: req.user!.sub },
        ...(forMonth ? { forMonth } : {}),
        ...(paymentType === 'material'
          ? { paymentType: 'material' }
          : paymentType
            ? { paymentType: paymentType as 'enrollment' | 'monthly' }
            : { paymentType: { in: ['enrollment', 'monthly'] } }),
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
          where: { forMonth, paymentType: { in: ['enrollment', 'monthly'] } },
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
    const paymentType = (req.query.paymentType as string) || undefined;

    const where: any = {};
    if (status) where.status = status;
    if (forMonth) where.forMonth = forMonth;
    if (classId) where.enrollment = { classId };
    if (paymentType === 'material') {
      where.paymentType = 'material';
    } else if (paymentType === 'enrollment' || paymentType === 'monthly') {
      where.paymentType = paymentType;
    } else {
      // Default staff list: class fees only (exclude material purchases).
      where.paymentType = { in: ['enrollment', 'monthly'] };
    }

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
    const baseWhere: any = {
      forMonth,
      paymentType: { in: ['enrollment', 'monthly'] },
    };
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
    const where: any = {
      status: 'pending',
      paymentType: { in: ['enrollment', 'monthly', 'material'] },
    };
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

  // Apply the review to payments created from the same multi-class / multi-material slip.
  const siblings = await prisma.payment.findMany({
    where: {
      id: { not: paymentId },
      slipFileId: payment.slipFileId,
      status: 'pending',
      enrollment: { studentId: payment.enrollment.studentId },
      ...(payment.paymentType === 'material' ? { paymentType: 'material' } : { forMonth: payment.forMonth }),
    },
    select: { id: true },
  });

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

    if (siblings.length) {
      await tx.payment.updateMany({
        where: { id: { in: siblings.map((sibling) => sibling.id) } },
        data: {
          status: targetStatus,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          note,
        },
      });
    }

    // Only explicit enrollment payments control enrollment activation.
    if (payment.paymentType === 'enrollment') {
      await tx.enrollment.update({
        where: { id: payment.enrollmentId },
        data: { status: approve ? 'active' : 'rejected' },
      });
    }

    return updated;
  });

  const materialTitle =
    payment.paymentType === 'material' && payment.materialId
      ? (
          await prisma.material.findFirst({
            where: { id: payment.materialId },
            select: { title: true },
          })
        )?.title
      : null;
  const subjectLabel = materialTitle
    ? `${materialTitle} (${payment.enrollment.class.title})`
    : payment.enrollment.class.title;

  await createNotification({
    tenantId: payment.tenantId,
    userId: payment.enrollment.studentId,
    type: approve ? 'payment_approved' : 'payment_rejected',
    title: approve ? 'Payment approved' : 'Payment rejected',
    body: approve
      ? `Your payment for ${subjectLabel} (${payment.forMonth}) was approved.`
      : `Your payment for ${subjectLabel} (${payment.forMonth}) was rejected.${note ? ` Note: ${note}` : ''}`,
    link: payment.paymentType === 'material' ? '/payments?section=materials' : '/payments',
  });

  if (payment.paymentType === 'material') {
    await syncMaterialOrderFromPaymentReview(
      payment.slipFileId,
      payment.enrollment.studentId,
      approve,
      reviewerId,
      note
    );
  }

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

    const paymentType = paymentTypeForEnrollment(enrollment.status);
    await assertNoDuplicatePayment(enrollment.id, data.forMonth, paymentType);
    const amount = netClassFee(enrollment.class.price, enrollment.feeWaiverAmount).toFixed(2);
    const orderId = `ph_${enrollment.id}_${data.forMonth}_${Date.now()}`;

    // Create a server-side pending payment bound to order_id + expected amount.
    const slip = await basePrisma.file.create({
      data: {
        tenantId: req.tenant!.id,
        ownerId: req.user!.sub,
        storageKey: `payhere/${orderId}.txt`,
        originalName: `payhere-${orderId}.txt`,
        mimeType: 'text/plain',
        size: 0,
        kind: 'slip',
      },
    });
    try {
      await prisma.payment.create({
        data: {
          tenantId: req.tenant!.id,
          enrollmentId: enrollment.id,
          amount,
          slipFileId: slip.id,
          paymentType,
          forMonth: data.forMonth,
          status: 'pending',
          orderId,
          note: 'PayHere checkout initiated',
        },
      });
    } catch (err) {
      mapPaymentCreateConflict(err, data.forMonth, paymentType);
    }

    const sandbox = env.payhereSandbox;
    res.json({
      checkout: {
        sandbox,
        action: sandbox
          ? 'https://sandbox.payhere.lk/pay/checkout'
          : 'https://www.payhere.lk/pay/checkout',
        merchant_id: tenant.payhereMerchantId,
        return_url: `${env.clientUrl}/${req.params.slug}/payments`,
        cancel_url: `${env.clientUrl}/${req.params.slug}/payments`,
        notify_url: `${env.apiPublicUrl}/api/t/${req.params.slug}/public/payhere/notify`,
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
