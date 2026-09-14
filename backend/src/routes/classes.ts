import { Router } from 'express';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import {
  classSchema,
  enrollExistingStudentSchema,
  enrollmentFeeWaiverSchema,
  studentInviteSchema,
} from '../validation/schemas';
import { persistUploadedFile } from '../services/files';
import { uploadCover } from '../middleware/upload';
import { enrollExistingStudentInClass, inviteStudentToClass } from '../services/studentInvite';
import {
  getOrCreateClassInviteLink,
  rotateClassInviteLink,
  setClassInviteLinkActive,
} from '../services/classInviteLink';
import { clampFeeWaiver, enrollmentStatusForNetFee, netClassFee } from '../lib/fees';
import { assertCanManageClass, isInstituteAdminRole } from '../services/classAccess';
import { canStudentSelfEnroll, listCatalogClassIds } from '../services/selfEnrollmentPolicy';
import { sendEnrollmentFeeReminder } from '../services/smartJobs';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { z } from 'zod';

// Mounted under /api/t/:slug (tenant context already established).
const router = Router({ mergeParams: true });

function serializeClass(klass: any) {
  return {
    id: klass.id,
    title: klass.title,
    description: klass.description,
    price: Number(klass.price),
    isPublished: klass.isPublished,
    coverImageId: klass.coverImageId,
    batch: klass.batch ? { id: klass.batch.id, name: klass.batch.name } : null,
    teacher: klass.teacher ? { id: klass.teacher.id, name: klass.teacher.name } : undefined,
    studentCount: klass._count?.enrollments,
    createdAt: klass.createdAt,
  };
}

async function resolveTeacherIdForAdmin(opts: {
  role: string;
  tenantId: string;
  teacherId?: string | null;
  fallbackTeacherId: string;
}) {
  if (!isInstituteAdminRole(opts.role) || !opts.teacherId) return opts.fallbackTeacherId;

  const teacher = await basePrisma.user.findFirst({
    where: {
      id: opts.teacherId,
      tenantId: opts.tenantId,
      role: { in: ['teacher', 'admin'] },
      status: 'approved',
    },
    select: { id: true },
  });
  if (!teacher) throw badRequest('Assigned teacher was not found in this institute');
  return teacher.id;
}

router.get(
  '/classes',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const where =
      user.role === 'teacher'
        ? { teacherId: user.sub }
        : isInstituteAdminRole(user.role)
        ? {}
        : // Students only see active (published) classes they are enrolled in.
          {
            isPublished: true,
            enrollments: { some: { studentId: user.sub } },
          };

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ classes: classes.map(serializeClass) });
  })
);

/** Published classes the student is not yet enrolled in (browse / self-enroll). */
router.get(
  '/classes/catalog',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const classIds = await listCatalogClassIds({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
    });
    if (!classIds.length) {
      res.json({ classes: [] });
      return;
    }
    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, isPublished: true },
      include: {
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { title: 'asc' },
    });
    res.json({ classes: classes.map(serializeClass) });
  })
);

router.get(
  '/classes/:classId',
  authenticate,
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({
      where: { id: req.params.classId },
      include: {
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!klass) throw notFound('Class not found');

    if (req.user!.role === 'teacher') {
      await assertCanManageClass(
        { role: req.user!.role, userId: req.user!.sub },
        klass.id,
        'You can only view your own classes'
      );
    }

    let enrollment = null;
    if (req.user!.role === 'student') {
      // Inactive classes are hidden from students entirely.
      if (!klass.isPublished) throw notFound('Class not found');
      enrollment = await prisma.enrollment.findFirst({
        where: { classId: klass.id, studentId: req.user!.sub },
        include: { payments: { orderBy: { createdAt: 'desc' } } },
      });
      // A student may only view classes they belong to.
      if (!enrollment) throw notFound('Class not found');
    }

    res.json({ class: serializeClass(klass), enrollment });
  })
);

router.post(
  '/classes',
  authenticate,
  requireRole('teacher', 'admin'),
  uploadCover,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    const data = classSchema.parse(req.body);

    let coverImageId: string | undefined;
    if (req.file) {
      const file = await persistUploadedFile(req.file, req.user!.sub, 'cover');
      coverImageId = file.id;
    }

    const teacherId = await resolveTeacherIdForAdmin({
      role: req.user!.role,
      tenantId: req.tenant!.id,
      teacherId: data.teacherId,
      fallbackTeacherId: req.user!.sub,
    });

    const klass = await prisma.class.create({
      data: {
        tenantId: req.tenant!.id,
        title: data.title,
        description: data.description ?? '',
        price: data.price,
        isPublished: data.isPublished ?? true,
        teacherId,
        batchId: data.batchId || null,
        coverImageId,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ class: serializeClass(klass) });
  })
);

router.patch(
  '/classes/:classId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only edit your own classes'
    );
    const data = classSchema.partial().parse(req.body);
    let teacherId: string | undefined;
    if (data.teacherId !== undefined) {
      if (!isInstituteAdminRole(req.user!.role)) {
        throw forbidden('Only institute admins can reassign class teachers');
      }
      teacherId = await resolveTeacherIdForAdmin({
        role: req.user!.role,
        tenantId: req.tenant!.id,
        teacherId: data.teacherId,
        fallbackTeacherId: klass.teacherId,
      });
    }
    const updated = await prisma.class.update({
      where: { id: klass.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
        ...(data.batchId !== undefined ? { batchId: data.batchId || null } : {}),
        ...(teacherId !== undefined ? { teacherId } : {}),
      },
      include: {
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    });
    res.json({ class: serializeClass(updated) });
  })
);

router.post(
  '/classes/:classId/enroll',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const allowed = await canStudentSelfEnroll({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: req.params.classId,
    });
    if (!allowed) {
      throw forbidden(
        'You cannot join this class yourself. Ask your teacher for an invite or class join link.'
      );
    }
    const klass = await prisma.class.findFirst({
      where: { id: req.params.classId, isPublished: true },
    });
    if (!klass || !klass.isPublished) throw notFound('Class not found');

    const existing = await prisma.enrollment.findFirst({
      where: { classId: klass.id, studentId: req.user!.sub },
    });
    if (existing) throw badRequest('You have already requested enrollment for this class');

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId: req.tenant!.id,
        classId: klass.id,
        studentId: req.user!.sub,
        status: enrollmentStatusForNetFee(klass.price, 0),
        feeWaiverAmount: 0,
      },
    });
    res.status(201).json({ enrollment });
  })
);

router.get(
  '/classes/:classId/students',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only view your own class roster'
    );
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: klass.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            freeIdCard: true,
            createdAt: true,
            phone: true,
            phones: true,
            guardianName: true,
            guardianPhone: true,
            guardianEmail: true,
            area: true,
            district: true,
            school: true,
            address: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      enrollments: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        feeWaiverAmount: Number(e.feeWaiverAmount),
        netFee: netClassFee(klass.price, e.feeWaiverAmount),
        classPrice: Number(klass.price),
        createdAt: e.createdAt,
        student: {
          ...e.student,
          phone: e.student.phones[0] ?? e.student.phone,
          phones:
            e.student.phones.length > 0
              ? e.student.phones
              : e.student.phone
                ? [e.student.phone]
                : [],
        },
      })),
    });
  })
);

// Invite a student to the class. Sends an email with a registration link.
// New students complete onboarding (profile + password) before they can sign in.
router.post(
  '/classes/:classId/students',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only manage your own class roster'
    );

    const data = studentInviteSchema.parse(req.body);
    const tenant = req.tenant!;

    const result = await inviteStudentToClass({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      classId: klass.id,
      classTitle: klass.title,
      invitedById: req.user!.sub,
      data,
    });

    res.status(201).json({
      invited: result.invited,
      enrollment: {
        id: result.enrollment.id,
        status: result.enrollment.status,
        student: {
          id: result.student.id,
          name: result.student.name,
          email: result.student.email,
          status: result.student.status,
          createdAt: result.student.createdAt,
        },
      },
    });
  })
);

router.post(
  '/classes/:classId/students/enroll-existing',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only manage your own class roster'
    );

    const { studentId, freeIdCard, feeWaiverAmount } = enrollExistingStudentSchema.parse(req.body);
    const tenant = req.tenant!;

    const result = await enrollExistingStudentInClass({
      tenantId: tenant.id,
      tenantName: tenant.name,
      classId: klass.id,
      classTitle: klass.title,
      studentId,
      freeIdCard,
      feeWaiverAmount,
    });

    res.status(201).json({
      invited: false,
      pendingRegistration: result.pendingRegistration,
      enrollment: {
        id: result.enrollment.id,
        status: result.enrollment.status,
        student: {
          id: result.student.id,
          name: result.student.name,
          email: result.student.email,
          status: result.student.status,
          createdAt: result.student.createdAt,
        },
      },
    });
  })
);

router.post(
  '/classes/:classId/students/:studentId/fee-reminder',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only remind students in your own classes'
    );

    const result = await sendEnrollmentFeeReminder({
      tenantId: req.tenant!.id,
      classId: klass.id,
      studentId: req.params.studentId,
      teacherId: req.user!.sub,
      actorRole: req.user!.role,
    });
    res.json(result);
  })
);

/** Update fee assistance for a student enrolled in this class. */
router.patch(
  '/classes/:classId/students/:studentId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanManageClass(
      { role: req.user!.role, userId: req.user!.sub },
      req.params.classId,
      'You can only manage your own classes'
    );
    const data = enrollmentFeeWaiverSchema.parse(req.body);
    const enrollment = await prisma.enrollment.findFirst({
      where: { classId: klass.id, studentId: req.params.studentId, tenantId: req.tenant!.id },
    });
    if (!enrollment) throw notFound('Student is not enrolled in this class');

    const feeWaiverAmount = clampFeeWaiver(klass.price, data.feeWaiverAmount);
    const nextStatus = enrollmentStatusForNetFee(klass.price, feeWaiverAmount);
    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        feeWaiverAmount,
        ...(enrollment.status === 'pending' ? { status: nextStatus } : {}),
      },
    });

    if (data.freeIdCard !== undefined) {
      await basePrisma.user.update({
        where: { id: req.params.studentId },
        data: { freeIdCard: data.freeIdCard },
      });
    } else if (feeWaiverAmount > 0) {
      await basePrisma.user.updateMany({
        where: { id: req.params.studentId, freeIdCard: false },
        data: { freeIdCard: true },
      });
    }

    res.json({
      enrollment: {
        id: updated.id,
        status: updated.status,
        feeWaiverAmount: Number(updated.feeWaiverAmount),
        netFee: netClassFee(klass.price, updated.feeWaiverAmount),
      },
    });
  })
);

async function managedClass(req: any) {
  return assertCanManageClass(
    { role: req.user!.role, userId: req.user!.sub },
    req.params.classId,
    'You can only manage your own classes'
  );
}

router.get(
  '/classes/:classId/invite-link',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await managedClass(req);
    res.json(
      await getOrCreateClassInviteLink({
        tenantId: req.tenant!.id,
        tenantSlug: req.tenant!.slug,
        classId: klass.id,
        createdById: req.user!.sub,
      })
    );
  })
);

router.post(
  '/classes/:classId/invite-link',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await managedClass(req);
    res.status(201).json(
      await getOrCreateClassInviteLink({
        tenantId: req.tenant!.id,
        tenantSlug: req.tenant!.slug,
        classId: klass.id,
        createdById: req.user!.sub,
      })
    );
  })
);

router.post(
  '/classes/:classId/invite-link/rotate',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await managedClass(req);
    res.json(
      await rotateClassInviteLink({
        tenantId: req.tenant!.id,
        tenantSlug: req.tenant!.slug,
        classId: klass.id,
        createdById: req.user!.sub,
      })
    );
  })
);

router.patch(
  '/classes/:classId/invite-link',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await managedClass(req);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const link = await setClassInviteLinkActive({ classId: klass.id, isActive });
    res.json({ isActive: link.isActive });
  })
);

/**
 * Remove a student from this class only.
 * Accounts are retained so staff cannot accidentally erase a student's history.
 */
router.delete(
  '/classes/:classId/students/:studentId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await managedClass(req);

    const student = await basePrisma.user.findFirst({
      where: {
        id: req.params.studentId,
        tenantId: req.tenant!.id,
        role: 'student',
      },
    });
    if (!student) throw notFound('Student not found');

    const enrollment = await prisma.enrollment.findFirst({
      where: { classId: klass.id, studentId: student.id, tenantId: req.tenant!.id },
    });
    if (!enrollment) throw notFound('Student is not enrolled in this class');

    await prisma.enrollment.delete({ where: { id: enrollment.id } });
    res.json({ removed: true, accountDeleted: false });
  })
);

export default router;
