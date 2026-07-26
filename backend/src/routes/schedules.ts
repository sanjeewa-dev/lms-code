import { Router } from 'express';
import type { ClassSchedule } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { classScheduleSchema } from '../validation/schemas';
import { forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

function parseClassDate(classDate: string) {
  const [year, month, day] = classDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function serializeSchedule(schedule: ClassSchedule) {
  const iso = schedule.classDate.toISOString().slice(0, 10);
  return {
    id: schedule.id,
    classDate: iso,
    classTime: schedule.classTime,
    platform: schedule.platform,
    meetingText: schedule.meetingText,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

async function loadClassWithAccess(req: any) {
  const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
  if (!klass) throw notFound('Class not found');
  return klass;
}

function assertTeacherOwnsClass(req: any, teacherId: string) {
  if (req.user!.role === 'teacher' && teacherId !== req.user!.sub) {
    throw forbidden('You can only manage schedules for your own classes');
  }
}

router.get(
  '/classes/:classId/schedules',
  authenticate,
  requireActiveEnrollment('classId'),
  asyncHandler(async (req, res) => {
    const schedules = await prisma.classSchedule.findMany({
      where: { classId: req.params.classId },
      orderBy: [{ classDate: 'asc' }, { classTime: 'asc' }],
    });
    res.json({ schedules: schedules.map(serializeSchedule) });
  })
);

router.post(
  '/classes/:classId/schedules',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await loadClassWithAccess(req);
    assertTeacherOwnsClass(req, klass.teacherId);

    const data = classScheduleSchema.parse(req.body);
    const schedule = await prisma.classSchedule.create({
      data: {
        tenantId: req.tenant!.id,
        classId: klass.id,
        classDate: parseClassDate(data.classDate),
        classTime: data.classTime,
        platform: data.platform,
        meetingText: data.meetingText ?? '',
      },
    });

    res.status(201).json({ schedule: serializeSchedule(schedule) });
  })
);

router.patch(
  '/classes/:classId/schedules/:scheduleId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await loadClassWithAccess(req);
    assertTeacherOwnsClass(req, klass.teacherId);

    const existing = await prisma.classSchedule.findFirst({
      where: { id: req.params.scheduleId, classId: klass.id },
    });
    if (!existing) throw notFound('Schedule not found');

    const data = classScheduleSchema.partial().parse(req.body);
    const schedule = await prisma.classSchedule.update({
      where: { id: existing.id },
      data: {
        classDate: data.classDate ? parseClassDate(data.classDate) : undefined,
        classTime: data.classTime,
        platform: data.platform,
        meetingText: data.meetingText,
      },
    });

    res.json({ schedule: serializeSchedule(schedule) });
  })
);

router.delete(
  '/classes/:classId/schedules/:scheduleId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await loadClassWithAccess(req);
    assertTeacherOwnsClass(req, klass.teacherId);

    const existing = await prisma.classSchedule.findFirst({
      where: { id: req.params.scheduleId, classId: klass.id },
    });
    if (!existing) throw notFound('Schedule not found');

    await prisma.classSchedule.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

export default router;
