import { Router } from 'express';
import type { ClassSchedule } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { classScheduleSchema } from '../validation/schemas';
import { forbidden, notFound, badRequest } from '../utils/httpError';
import { makeJitsiToken, makeRoomName } from '../services/jitsi';
import { env } from '../config/env';
import { sendLiveClassStarted } from '../services/email';
import { assertHttpsPublicUrl } from '../utils/safeUrl';

const router = Router({ mergeParams: true });

function parseClassDate(classDate: string) {
  const [year, month, day] = classDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Expand recurring schedule dates from start..until (inclusive). Cap at 52 sessions. */
function expandRepeatDates(
  startIso: string,
  untilIso: string,
  repeat: 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'custom',
  customDays: number[] = []
): string[] {
  if (repeat === 'once') return [startIso];

  const start = parseClassDate(startIso);
  const until = parseClassDate(untilIso);
  if (until < start) throw badRequest('Repeat until date must be on or after the start date');

  if (repeat === 'custom' && (!customDays.length || customDays.some((d) => d < 0 || d > 6))) {
    throw badRequest('Select at least one day for a custom schedule');
  }

  const customSet = new Set(customDays);
  const dates: string[] = [];
  const cursor = new Date(start);
  const max = 52;

  while (cursor <= until && dates.length < max) {
    const dow = cursor.getUTCDay(); // 0=Sun … 6=Sat
    let include = false;
    if (repeat === 'daily') include = true;
    else if (repeat === 'weekly') include = dow === start.getUTCDay();
    else if (repeat === 'weekdays') include = dow >= 1 && dow <= 5;
    else if (repeat === 'weekends') include = dow === 0 || dow === 6;
    else if (repeat === 'custom') include = customSet.has(dow);

    if (include) dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (!dates.length) throw badRequest('No sessions fall within the selected date range');
  return dates;
}

function serializeSchedule(schedule: ClassSchedule) {
  const iso = schedule.classDate.toISOString().slice(0, 10);
  return {
    id: schedule.id,
    classDate: iso,
    classTime: schedule.classTime,
    platform: schedule.platform,
    meetingText: schedule.meetingText,
    status: schedule.status,
    roomName: schedule.roomName,
    startedAt: schedule.startedAt?.toISOString() ?? null,
    endedAt: schedule.endedAt?.toISOString() ?? null,
    recordingUrl: schedule.recordingUrl ?? null,
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
    const repeat = data.repeat ?? 'once';

    if (repeat !== 'once' && !data.repeatUntil) {
      throw badRequest('Repeat until date is required for recurring schedules');
    }
    if (repeat === 'custom' && !(data.customDays?.length)) {
      throw badRequest('Select at least one day for a custom schedule');
    }

    const dates = expandRepeatDates(
      data.classDate,
      data.repeatUntil ?? data.classDate,
      repeat,
      data.customDays ?? []
    );

    if (dates.length === 1) {
      const schedule = await prisma.classSchedule.create({
        data: {
          tenantId: req.tenant!.id,
          classId: klass.id,
          classDate: parseClassDate(dates[0]),
          classTime: data.classTime,
          platform: data.platform,
          meetingText: data.meetingText ?? '',
        },
      });
      return res.status(201).json({ schedule: serializeSchedule(schedule), created: 1 });
    }

    await prisma.classSchedule.createMany({
      data: dates.map((iso) => ({
        tenantId: req.tenant!.id,
        classId: klass.id,
        classDate: parseClassDate(iso),
        classTime: data.classTime,
        platform: data.platform,
        meetingText: data.meetingText ?? '',
      })),
    });

    const schedules = await prisma.classSchedule.findMany({
      where: {
        classId: klass.id,
        classTime: data.classTime,
        platform: data.platform,
        classDate: { in: dates.map(parseClassDate) },
      },
      orderBy: [{ classDate: 'asc' }, { classTime: 'asc' }],
    });

    res.status(201).json({
      schedules: schedules.map(serializeSchedule),
      created: schedules.length,
      schedule: serializeSchedule(schedules[0]),
    });
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

/** POST /classes/:classId/schedules/:scheduleId/start — teacher/admin starts a live session */
router.post(
  '/classes/:classId/schedules/:scheduleId/start',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await loadClassWithAccess(req);
    assertTeacherOwnsClass(req, klass.teacherId);

    const existing = await prisma.classSchedule.findFirst({
      where: { id: req.params.scheduleId, classId: klass.id },
    });
    if (!existing) throw notFound('Schedule not found');
    if (existing.status === 'live') {
      // Already live — just return the token again
      const teacher = await prisma.user.findUnique({ where: { id: req.user!.sub } });
      const jwt = makeJitsiToken({
        roomName: existing.roomName!,
        displayName: teacher?.name ?? 'Teacher',
        email: teacher?.email ?? '',
        isModerator: true,
      });
      return res.json({
        schedule: serializeSchedule(existing),
        roomName: existing.roomName,
        jitsiHost: env.jitsi.host,
        jwt,
      });
    }
    if (existing.status === 'ended') throw badRequest('This session has already ended');

    const roomName = makeRoomName(req.tenant!.slug, existing.id);

    const schedule = await prisma.classSchedule.update({
      where: { id: existing.id },
      data: { status: 'live', roomName, startedAt: new Date() },
    });

    const teacher = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    const jwt = makeJitsiToken({
      roomName,
      displayName: teacher?.name ?? 'Teacher',
      email: teacher?.email ?? '',
      isModerator: true,
    });

    // Notify enrolled students async (don't await to keep response fast)
    (async () => {
      try {
        const enrollments = await prisma.enrollment.findMany({
          where: { classId: klass.id, status: 'active' },
          include: { student: true },
        });
        const joinUrl = `${env.clientUrl}/${req.tenant!.slug}/live`;
        await Promise.allSettled(
          enrollments.map((e) =>
            sendLiveClassStarted({
              to: e.student.email,
              studentName: e.student.name,
              teacherName: teacher?.name ?? 'Your teacher',
              className: klass.title,
              instituteName: req.tenant!.name,
              joinUrl,
              tenantId: req.tenant!.id,
            })
          )
        );
      } catch {
        /* swallow notification errors */
      }
    })();

    res.json({
      schedule: serializeSchedule(schedule),
      roomName,
      jitsiHost: env.jitsi.host,
      jwt,
    });
  })
);

/** POST /classes/:classId/schedules/:scheduleId/end — teacher/admin ends the live session */
router.post(
  '/classes/:classId/schedules/:scheduleId/end',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await loadClassWithAccess(req);
    assertTeacherOwnsClass(req, klass.teacherId);

    const existing = await prisma.classSchedule.findFirst({
      where: { id: req.params.scheduleId, classId: klass.id },
    });
    if (!existing) throw notFound('Schedule not found');

    const rawRecordingUrl = req.body.recordingUrl;
    const recordingUrl =
      typeof rawRecordingUrl === 'string' && rawRecordingUrl.trim()
        ? assertHttpsPublicUrl(rawRecordingUrl.trim())
        : null;

    const schedule = await prisma.classSchedule.update({
      where: { id: existing.id },
      data: {
        status: 'ended',
        endedAt: new Date(),
        recordingUrl: recordingUrl || undefined,
      },
    });

    res.json({ schedule: serializeSchedule(schedule) });
  })
);

/** GET /classes/:classId/schedules/:scheduleId/join — student joins live session (auto-marks attendance) */
router.get(
  '/classes/:classId/schedules/:scheduleId/join',
  authenticate,
  requireActiveEnrollment('classId'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.classSchedule.findFirst({
      where: { id: req.params.scheduleId, classId: req.params.classId },
    });
    if (!existing) throw notFound('Schedule not found');
    if (existing.status !== 'live') throw badRequest('This session is not currently live');

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });

    const jwt = makeJitsiToken({
      roomName: existing.roomName!,
      displayName: user?.name ?? 'Student',
      email: user?.email ?? '',
      isModerator: false,
    });

    // Auto-mark attendance
    try {
      const today = new Date(existing.classDate);
      await prisma.attendance.upsert({
        where: {
          classId_studentId_sessionDate: {
            classId: req.params.classId,
            studentId: req.user!.sub,
            sessionDate: today,
          },
        },
        create: {
          tenantId: req.tenant!.id,
          classId: req.params.classId,
          scheduleId: existing.id,
          studentId: req.user!.sub,
          sessionDate: today,
          status: 'present',
          markedById: req.user!.sub,
        },
        update: { status: 'present', scheduleId: existing.id },
      });
    } catch {
      /* attendance marking is best-effort */
    }

    res.json({
      roomName: existing.roomName,
      jitsiHost: env.jitsi.host,
      jwt,
    });
  })
);

export default router;
