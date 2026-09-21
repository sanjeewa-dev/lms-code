import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma, basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { teacherCreateSchema, teacherUpdateSchema, studentFreeCardSchema, studentUpdateSchema } from '../validation/schemas';
import { badRequest, conflict, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

const staff = [authenticate, requireRole('teacher', 'admin')];
const adminOnly = [authenticate, requireRole('admin')];

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  subject: true,
  createdAt: true,
} as const;

function serializeTeacher(t: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address?: string | null;
  subject: string | null;
  createdAt: Date;
  classesOwned?: { id: string; title: string }[];
}) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    phone: t.phone ?? '',
    address: t.address ?? '',
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
    const user = req.user!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const forMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const teacherClassFilter =
      user.role === 'teacher' ? { teacherId: user.sub } : {};

    const [
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
      approved,
      openInterventions,
      liveTodayCount,
      draftQuizzes,
    ] = await Promise.all([
      user.role === 'teacher'
        ? prisma.enrollment
            .findMany({
              where: { status: 'active', class: { teacherId: user.sub } },
              select: { studentId: true },
              distinct: ['studentId'],
            })
            .then((rows) => rows.length)
        : basePrisma.user.count({ where: { tenantId, role: 'student' } }),
      basePrisma.user.count({ where: { tenantId, role: 'teacher' } }),
      prisma.class.count(user.role === 'teacher' ? { where: { teacherId: user.sub } } : undefined),
      prisma.videoLesson.count(),
      prisma.notice.count(),
      prisma.event.count(),
      prisma.quiz.count(
        user.role === 'teacher' ? { where: { class: { teacherId: user.sub } } } : undefined
      ),
      prisma.quizAttempt.count(
        user.role === 'teacher' ? { where: { quiz: { class: { teacherId: user.sub } } } } : undefined
      ),
      prisma.enrollment.count(
        user.role === 'teacher' ? { where: { class: { teacherId: user.sub } } } : undefined
      ),
      prisma.payment.count({ where: { status: 'pending' } }),
      prisma.payment.findMany({
        where: { status: 'approved', forMonth },
        select: { amount: true },
      }),
      prisma.intervention.count({
        where: {
          status: { in: ['open', 'in_progress', 'escalated'] },
          ...(user.role === 'teacher'
            ? {
                OR: [
                  { createdById: user.sub },
                  { student: { enrollments: { some: { status: 'active', class: { teacherId: user.sub } } } } },
                ],
              }
            : {}),
        },
      }),
      prisma.classSchedule.count({
        where: {
          OR: [
            { status: 'live', ...(Object.keys(teacherClassFilter).length ? { class: teacherClassFilter } : {}) },
            {
              classDate: { gte: today, lt: tomorrow },
              ...(Object.keys(teacherClassFilter).length ? { class: teacherClassFilter } : {}),
            },
          ],
        },
      }),
      prisma.quiz.count({
        where: {
          isPublished: false,
          ...(user.role === 'teacher' ? { class: { teacherId: user.sub } } : {}),
        },
      }),
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
        openInterventions,
        liveTodayCount,
        draftQuizzes,
      },
    });
  })
);

/** Student home: pending quizzes + continue-learning hint. */
router.get(
  '/me/todo',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'active' },
      include: {
        class: { select: { id: true, title: true, updatedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const classIds = enrollments.map((e) => e.classId);

    const quizzes = classIds.length
      ? await prisma.quiz.findMany({
          where: { classId: { in: classIds }, isPublished: true },
          include: {
            class: { select: { id: true, title: true } },
            attempts: {
              where: { studentId, submittedAt: { not: null } },
              take: 1,
              select: { id: true, score: true, submittedAt: true },
            },
            _count: { select: { questions: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        })
      : [];

    const pendingQuizzes = quizzes
      .filter((q) => q.attempts.length === 0)
      .slice(0, 8)
      .map((q) => ({
        id: q.id,
        title: q.title,
        classId: q.classId,
        classTitle: q.class.title,
        questionCount: q._count.questions,
        timeLimitSec: q.timeLimitSec,
        totalMarks: q.totalMarks,
      }));

    const recentAttempt = await prisma.quizAttempt.findFirst({
      where: { studentId, submittedAt: { not: null } },
      include: {
        quiz: { select: { id: true, title: true, totalMarks: true, classId: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const continueClass = enrollments[0]?.class
      ? { id: enrollments[0].class.id, title: enrollments[0].class.title }
      : null;

    res.json({
      todo: {
        continueClass,
        pendingQuizzes,
        recentAttempt: recentAttempt
          ? {
              id: recentAttempt.id,
              score: recentAttempt.score,
              totalMarks: recentAttempt.quiz.totalMarks,
              quizTitle: recentAttempt.quiz.title,
              quizId: recentAttempt.quiz.id,
              classId: recentAttempt.quiz.classId,
              submittedAt: recentAttempt.submittedAt,
            }
          : null,
      },
    });
  })
);

// Tenant-wide student directory is an institute-admin operation.
router.get(
  '/students',
  ...adminOnly,
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
        guardianEmail: true,
        area: true,
        district: true,
        school: true,
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
  ...adminOnly,
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
    if (next === 'rejected') {
      await basePrisma.refreshToken.deleteMany({ where: { userId: student.id } });
    }
    res.json({ student: updated });
  })
);

// Update student details (from class roster / directory).
router.patch(
  '/students/:id',
  ...adminOnly,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.id;
    const student = await basePrisma.user.findFirst({
      where: { id: req.params.id, tenantId, role: 'student' },
    });
    if (!student) throw notFound('Student not found');

    const data = studentUpdateSchema.parse(req.body);

    if (data.email && data.email !== student.email) {
      const clash = await basePrisma.user.findFirst({
        where: { tenantId, email: data.email, id: { not: student.id } },
      });
      if (clash) throw conflict('A user with that email already exists in this institute');
    }

    const phones =
      data.phones !== undefined
        ? data.phones.map((p) => p.trim()).filter(Boolean)
        : undefined;
    const primaryPhone =
      phones !== undefined
        ? phones[0] ?? null
        : data.phone !== undefined
          ? data.phone?.trim() || null
          : undefined;

    const updated = await basePrisma.user.update({
      where: { id: student.id },
      data: {
        name: data.name,
        email: data.email,
        phone: primaryPhone,
        phones: phones,
        guardianName:
          data.guardianName !== undefined ? data.guardianName?.trim() || null : undefined,
        guardianPhone:
          data.guardianPhone !== undefined ? data.guardianPhone?.trim() || null : undefined,
        guardianEmail:
          data.guardianEmail !== undefined
            ? data.guardianEmail === '' || data.guardianEmail === null
              ? null
              : data.guardianEmail.trim()
            : undefined,
        area: data.area !== undefined ? data.area?.trim() || null : undefined,
        district: data.district !== undefined ? data.district?.trim() || null : undefined,
        school: data.school !== undefined ? data.school?.trim() || null : undefined,
        address: data.address !== undefined ? data.address?.trim() || null : undefined,
        freeIdCard: data.freeIdCard,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phones: true,
        guardianName: true,
        guardianPhone: true,
        guardianEmail: true,
        area: true,
        district: true,
        school: true,
        address: true,
        freeIdCard: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({
      student: {
        ...updated,
        phone: updated.phones[0] ?? updated.phone,
        phones: updated.phones.length > 0 ? updated.phones : updated.phone ? [updated.phone] : [],
      },
    });
  })
);

// Offer / revoke free student ID card.
router.patch(
  '/students/:id/free-card',
  ...adminOnly,
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
  ...adminOnly,
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
        address: data.address?.trim() || null,
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
      address: data.address !== undefined ? data.address?.trim() || null : undefined,
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
