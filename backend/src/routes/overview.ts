import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { teacherCreateSchema, teacherUpdateSchema, studentFreeCardSchema } from '../validation/schemas';
import { badRequest, conflict, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

const staff = [authenticate, requireRole('teacher', 'admin')];
const adminOnly = [authenticate, requireRole('admin')];

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  subject: true,
  createdAt: true,
} as const;

function serializeTeacher(t: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  createdAt: Date;
  classesOwned?: { id: string; title: string }[];
}) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone ?? '',
    subject: t.subject ?? '',
    createdAt: t.createdAt,
    classes: t.classesOwned?.map((c) => ({ id: c.id, title: c.title })) ?? [],
  };
}

async function syncTeacherClasses(tenantId: string, teacherId: string, classIds: string[] | undefined) {
  if (classIds === undefined) return;

  const uniqueIds = [...new Set(classIds)];
  if (uniqueIds.length) {
    const owned = await basePrisma.class.findMany({
      where: { tenantId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (owned.length !== uniqueIds.length) throw badRequest('One or more classes were not found');
  }

  const current = await basePrisma.class.findMany({
    where: { tenantId, teacherId },
    select: { id: true },
  });
  const currentIds = new Set(current.map((c) => c.id));
  const nextIds = new Set(uniqueIds);

  const toAssign = uniqueIds.filter((id) => !currentIds.has(id));
  const toRelease = [...currentIds].filter((id) => !nextIds.has(id));

  if (toAssign.length) {
    await basePrisma.class.updateMany({
      where: { tenantId, id: { in: toAssign } },
      data: { teacherId },
    });
  }

  if (toRelease.length) {
    const fallbackAdmin = await basePrisma.user.findFirst({
      where: { tenantId, role: 'admin', status: 'approved' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!fallbackAdmin) throw badRequest('Cannot unassign classes without an institute admin to fall back to');
    await basePrisma.class.updateMany({
      where: { tenantId, id: { in: toRelease } },
      data: { teacherId: fallbackAdmin.id },
    });
  }
}

// Aggregate stats for the admin/teacher dashboard.
router.get(
  '/stats',
  ...staff,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.id;

    const [students, teachers, classes, videos, notices, events, quizzes, attempts, enrollments, pendingPayments, approved] =
      await Promise.all([
        basePrisma.user.count({ where: { tenantId, role: 'student' } }),
        basePrisma.user.count({ where: { tenantId, role: 'teacher' } }),
        prisma.class.count({}),
        prisma.videoLesson.count({}),
        prisma.notice.count({}),
        prisma.event.count({}),
        prisma.quiz.count({}),
        prisma.quizAttempt.count({}),
        prisma.enrollment.count({}),
        prisma.payment.count({ where: { status: 'pending' } }),
        prisma.payment.findMany({ where: { status: 'approved' }, select: { amount: true } }),
      ]);

    const revenue = approved.reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      stats: {
        students,
        teachers,
        classes,
        videos,
        notices,
        events,
        quizzes,
        attempts,
        enrollments,
        pendingPayments,
        revenue,
      },
    });
  })
);

// Tenant-wide student directory.
router.get(
  '/students',
  ...staff,
  asyncHandler(async (req, res) => {
    const students = await basePrisma.user.findMany({
      where: { tenantId: req.tenant!.id, role: 'student' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phones: true,
        guardianName: true,
        guardianPhone: true,
        area: true,
        district: true,
        address: true,
        freeIdCard: true,
        status: true,
        createdAt: true,
        enrollments: {
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            class: { select: { id: true, title: true } },
          },
        },
      },
    });
    res.json({
      students: students.map(({ enrollments, phone, phones, ...s }) => ({
        ...s,
        phone: phones[0] ?? phone,
        phones: phones.length > 0 ? phones : phone ? [phone] : [],
        classes: enrollments.map((e) => e.class.title),
        classEnrollments: enrollments.map((e) => ({
          classId: e.class.id,
          title: e.class.title,
          status: e.status,
        })),
      })),
    });
  })
);

// Approve / reject a student.
router.patch(
  '/students/:id/status',
  ...staff,
  asyncHandler(async (req, res) => {
    const next = req.body?.status;
    if (next !== 'approved' && next !== 'rejected') {
      throw badRequest("status must be 'approved' or 'rejected'");
    }
    const student = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.id, role: 'student' },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!student) throw notFound('Student not found');
    if (next === 'approved' && student._count.enrollments === 0) {
      throw badRequest(
        'Students must be enrolled in at least one class before approval. Invite them from a class roster first.'
      );
    }
    const updated = await basePrisma.user.update({
      where: { id: student.id },
      data: { status: next },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
    });
    res.json({ student: updated });
  })
);

// Offer / revoke free student ID card.
router.patch(
  '/students/:id/free-card',
  ...staff,
  asyncHandler(async (req, res) => {
    const { freeIdCard } = studentFreeCardSchema.parse(req.body);
    const student = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.id, role: 'student' },
    });
    if (!student) throw notFound('Student not found');
    const updated = await basePrisma.user.update({
      where: { id: student.id },
      data: { freeIdCard },
      select: {
        id: true,
        name: true,
        email: true,
        freeIdCard: true,
        status: true,
        createdAt: true,
      },
    });
    res.json({ student: updated });
  })
);

// Delete a student (and their tenant-scoped data via cascades).
router.delete(
  '/students/:id',
  ...staff,
  asyncHandler(async (req, res) => {
    const student = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenant!.id, role: 'student' },
    });
    if (!student) throw notFound('Student not found');
    await basePrisma.user.delete({ where: { id: student.id } });
    res.status(204).send();
  })
);

// Tenant-wide teacher directory.
router.get(
  '/teachers',
  ...staff,
  asyncHandler(async (req, res) => {
    const teachers = await basePrisma.user.findMany({
      where: { tenantId: req.tenant!.id, role: 'teacher' },
      orderBy: { createdAt: 'desc' },
      select: {
        ...teacherSelect,
        classesOwned: { select: { id: true, title: true }, orderBy: { title: 'asc' } },
      },
    });
    res.json({ teachers: teachers.map(serializeTeacher) });
  })
);

// Create a teacher account.
router.post(
  '/teachers',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const data = teacherCreateSchema.parse(req.body);
    const tenantId = req.tenant!.id;

    const existing = await basePrisma.user.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) throw conflict('A user with that email already exists in this institute');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const teacher = await basePrisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'teacher',
        status: 'approved',
        subject: data.subject || null,
        phone: data.phone || null,
      },
      select: {
        ...teacherSelect,
        classesOwned: { select: { id: true, title: true } },
      },
    });

    if (data.classIds?.length) {
      await syncTeacherClasses(tenantId, teacher.id, data.classIds);
    }

    const withClasses = await basePrisma.user.findFirst({
      where: { id: teacher.id },
      select: {
        ...teacherSelect,
        classesOwned: { select: { id: true, title: true }, orderBy: { title: 'asc' } },
      },
    });

    res.status(201).json({ teacher: serializeTeacher(withClasses!) });
  })
);

// Update a teacher (details, optional new password).
router.patch(
  '/teachers/:id',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.id;
    const teacher = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: 'teacher' },
    });
    if (!teacher) throw notFound('Teacher not found');

    const raw = { ...req.body } as Record<string, unknown>;
    for (const key of ['name', 'email', 'password'] as const) {
      if (!raw[key]) delete raw[key];
    }
    const data = teacherUpdateSchema.parse(raw);

    if (data.email && data.email !== teacher.email) {
      const clash = await basePrisma.user.findFirst({
        where: { tenantId, email: data.email, id: { not: teacher.id } },
      });
      if (clash) throw conflict('A user with that email already exists in this institute');
    }

    const update: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      subject: data.subject ?? undefined,
      phone: data.phone ?? undefined,
    };
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

    const updated = await basePrisma.user.update({
      where: { id: teacher.id },
      data: update,
      select: {
        ...teacherSelect,
        classesOwned: { select: { id: true, title: true } },
      },
    });

    if (data.classIds !== undefined) {
      await syncTeacherClasses(tenantId, teacher.id, data.classIds);
    }

    const withClasses = await basePrisma.user.findFirst({
      where: { id: teacher.id },
      select: {
        ...teacherSelect,
        classesOwned: { select: { id: true, title: true }, orderBy: { title: 'asc' } },
      },
    });

    res.json({ teacher: serializeTeacher(withClasses!) });
  })
);

// Delete a teacher. Blocked while they still own classes to avoid orphaning.
router.delete(
  '/teachers/:id',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.id;
    const teacher = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: 'teacher' },
    });
    if (!teacher) throw notFound('Teacher not found');

    const ownedClasses = await basePrisma.class.count({ where: { teacherId: teacher.id } });
    if (ownedClasses > 0) {
      throw badRequest(
        'This teacher owns classes. Reassign or remove those classes before deleting the teacher.'
      );
    }

    await basePrisma.user.delete({ where: { id: teacher.id } });
    res.status(204).send();
  })
);

export default router;
