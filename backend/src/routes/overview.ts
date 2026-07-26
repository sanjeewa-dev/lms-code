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
}) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone ?? '',
    subject: t.subject ?? '',
    createdAt: t.createdAt,
  };
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
          select: { class: { select: { title: true } } },
        },
      },
    });
    res.json({
      students: students.map(({ enrollments, phone, phones, ...s }) => ({
        ...s,
        phone: phones[0] ?? phone,
        phones: phones.length > 0 ? phones : phone ? [phone] : [],
        classes: [...new Set(enrollments.map((e) => e.class.title))],
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
    });
    if (!student) throw notFound('Student not found');
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
      select: teacherSelect,
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
      select: teacherSelect,
    });

    res.status(201).json({ teacher: serializeTeacher(teacher) });
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
      select: teacherSelect,
    });
    res.json({ teacher: serializeTeacher(updated) });
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
