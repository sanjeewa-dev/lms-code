import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { attendanceMarkSchema } from '../validation/schemas';
import { badRequest, forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

async function assertCanManageClass(req: any, classId: string) {
  const klass = await prisma.class.findFirst({ where: { id: classId } });
  if (!klass) throw notFound('Class not found');
  if (req.user.role === 'teacher' && klass.teacherId !== req.user.sub) {
    throw forbidden('You can only manage attendance for your own classes');
  }
  return klass;
}

router.get(
  '/attendance/classes',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === 'teacher' ? { teacherId: req.user!.sub } : {};
    const classes = await prisma.class.findMany({
      where,
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    res.json({ classes });
  })
);

router.get(
  '/classes/:classId/attendance',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    await assertCanManageClass(req, req.params.classId);
    const sessionDate = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) throw badRequest('Invalid date');

    const [students, records, schedules] = await Promise.all([
      prisma.enrollment.findMany({
        where: { classId: req.params.classId, status: 'active' },
        include: { student: { select: { id: true, name: true, email: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      prisma.attendance.findMany({
        where: {
          classId: req.params.classId,
          sessionDate: new Date(sessionDate),
        },
      }),
      prisma.classSchedule.findMany({
        where: { classId: req.params.classId, classDate: new Date(sessionDate) },
        select: { id: true, classTime: true, platform: true, meetingText: true },
      }),
    ]);

    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    res.json({
      sessionDate,
      schedules,
      roster: students.map((e) => ({
        studentId: e.student.id,
        name: e.student.name,
        email: e.student.email,
        status: byStudent.get(e.student.id)?.status ?? null,
        note: byStudent.get(e.student.id)?.note ?? null,
        attendanceId: byStudent.get(e.student.id)?.id ?? null,
      })),
    });
  })
);

router.post(
  '/classes/:classId/attendance',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    await assertCanManageClass(req, req.params.classId);
    const data = attendanceMarkSchema.parse(req.body);
    const sessionDate = new Date(data.sessionDate);
    const tenantId = req.tenant!.id;

    await prisma.$transaction(
      data.records.map((r) =>
        prisma.attendance.upsert({
          where: {
            classId_studentId_sessionDate: {
              classId: req.params.classId,
              studentId: r.studentId,
              sessionDate,
            },
          },
          create: {
            tenantId,
            classId: req.params.classId,
            studentId: r.studentId,
            sessionDate,
            status: r.status,
            note: r.note ?? null,
            scheduleId: data.scheduleId ?? null,
            markedById: req.user!.sub,
          },
          update: {
            status: r.status,
            note: r.note ?? null,
            scheduleId: data.scheduleId ?? null,
            markedById: req.user!.sub,
          },
        })
      )
    );

    const records = await prisma.attendance.findMany({
      where: { classId: req.params.classId, sessionDate },
    });
    res.json({ sessionDate: data.sessionDate, records });
  })
);

router.get(
  '/attendance/mine',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const records = await prisma.attendance.findMany({
      where: { studentId: req.user!.sub },
      include: { class: { select: { id: true, title: true } } },
      orderBy: [{ sessionDate: 'desc' }],
      take: 100,
    });
    res.json({
      records: records.map((r) => ({
        id: r.id,
        sessionDate: r.sessionDate,
        status: r.status,
        note: r.note,
        class: r.class,
      })),
    });
  })
);

router.get(
  '/classes/:classId/attendance/summary',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    await assertCanManageClass(req, req.params.classId);
    const records = await prisma.attendance.findMany({
      where: { classId: req.params.classId },
      include: { student: { select: { id: true, name: true } } },
    });

    const byStudent = new Map<
      string,
      { studentId: string; name: string; present: number; absent: number; late: number; excused: number; total: number }
    >();

    for (const r of records) {
      const row = byStudent.get(r.studentId) ?? {
        studentId: r.studentId,
        name: r.student.name,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        total: 0,
      };
      row.total += 1;
      row[r.status] += 1;
      byStudent.set(r.studentId, row);
    }

    res.json({ summary: [...byStudent.values()] });
  })
);

export default router;
