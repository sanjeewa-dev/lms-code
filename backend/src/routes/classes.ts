import { Router } from 'express';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { classSchema, enrollExistingStudentSchema, studentInviteSchema } from '../validation/schemas';
import { persistUploadedFile } from '../services/files';
import { uploadCover } from '../middleware/upload';
import { enrollExistingStudentInClass, inviteStudentToClass } from '../services/studentInvite';
import { badRequest, forbidden, notFound } from '../utils/httpError';

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

router.get(
  '/classes',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const where =
      user.role === 'teacher'
        ? { teacherId: user.sub }
        : user.role === 'admin' || user.role === 'superadmin'
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
    const enrolled = await prisma.enrollment.findMany({
      where: { studentId: req.user!.sub },
      select: { classId: true },
    });
    const enrolledIds = enrolled.map((e) => e.classId);
    const classes = await prisma.class.findMany({
      where: {
        isPublished: true,
        ...(enrolledIds.length ? { id: { notIn: enrolledIds } } : {}),
      },
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

    const klass = await prisma.class.create({
      data: {
        tenantId: req.tenant!.id,
        title: data.title,
        description: data.description ?? '',
        price: data.price,
        isPublished: data.isPublished ?? true,
        teacherId: req.user!.sub,
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
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only edit your own classes');
    }
    const data = classSchema.partial().parse(req.body);
    const updated = await prisma.class.update({
      where: { id: klass.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
        ...(data.batchId !== undefined ? { batchId: data.batchId || null } : {}),
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
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
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
        status: Number(klass.price) === 0 ? 'active' : 'pending',
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
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only view your own class roster');
    }
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
            address: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      enrollments: enrollments.map((e) => ({
        ...e,
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
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only manage your own class roster');
    }

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
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only manage your own class roster');
    }

    const { studentId, freeIdCard } = enrollExistingStudentSchema.parse(req.body);
    const tenant = req.tenant!;

    const result = await enrollExistingStudentInClass({
      tenantId: tenant.id,
      tenantName: tenant.name,
      classId: klass.id,
      classTitle: klass.title,
      studentId,
      freeIdCard,
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

/**
 * Remove a student from this class only.
 * If it was their last enrollment, the student account is deleted (no orphan students).
 */
router.delete(
  '/classes/:classId/students/:studentId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only manage your own classes');
    }

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

    const otherCount = await prisma.enrollment.count({
      where: { studentId: student.id, tenantId: req.tenant!.id, id: { not: enrollment.id } },
    });

    await prisma.enrollment.delete({ where: { id: enrollment.id } });

    if (otherCount === 0) {
      await basePrisma.user.delete({ where: { id: student.id } });
      return res.json({ removed: true, accountDeleted: true });
    }

    res.json({ removed: true, accountDeleted: false });
  })
);

export default router;
