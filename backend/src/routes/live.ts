import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { makeJitsiToken, makeRoomName } from '../services/jitsi';
import { createNotifications } from '../services/notifications';
import { sendLiveClassStarted } from '../services/email';
import { env } from '../config/env';
import { forbidden } from '../utils/httpError';
import { notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

router.get(
  '/live/upcoming',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let classFilter: { id?: { in: string[] }; teacherId?: string } = {};

    if (user.role === 'teacher') {
      classFilter = { teacherId: user.sub };
    } else if (user.role === 'student') {
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.sub, status: 'active' },
        select: { classId: true },
      });
      classFilter = { id: { in: enrollments.map((e) => e.classId) } };
    }

    const schedules = await prisma.classSchedule.findMany({
      where: {
        // Show: sessions today-or-future, OR currently live sessions from any date
        OR: [
          {
            classDate: { gte: today },
            ...(Object.keys(classFilter).length ? { class: classFilter } : {}),
          },
          {
            status: 'live',
            ...(Object.keys(classFilter).length ? { class: classFilter } : {}),
          },
        ],
      },
      include: {
        class: {
          select: {
            id: true,
            title: true,
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ classDate: 'asc' }, { classTime: 'asc' }],
      take: 40,
    });

    const isStudent = user.role === 'student';
    res.json({
      sessions: schedules.map((s) => ({
        id: s.id,
        classDate: s.classDate,
        classTime: s.classTime,
        platform: s.platform,
        meetingText: isStudent
          ? s.meetingText.replace(/https?:\/\/[^\s]+/gi, '').trim()
          : s.meetingText,
        hasExternalMeetingLink: Boolean(s.externalMeetingUrl),
        status: s.status,
        roomName: s.roomName,
        class: s.class,
      })),
    });
  })
);

/**
 * GET /live/students
 * Returns all students enrolled in any class the teacher owns,
 * used to populate the invite-students picker.
 */
router.get(
  '/live/students',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const classWhere =
      user.role === 'teacher'
        ? { tenantId: req.tenant!.id, teacherId: user.sub }
        : { tenantId: req.tenant!.id };

    const classes = await prisma.class.findMany({
      where: classWhere,
      select: {
        id: true,
        title: true,
        enrollments: {
          where: { status: 'active' },
          select: {
            student: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Deduplicate students by id
    const seen = new Set<string>();
    const students: { id: string; name: string; email: string; classes: string[] }[] = [];

    for (const c of classes) {
      for (const e of c.enrollments) {
        const s = e.student;
        if (!seen.has(s.id)) {
          seen.add(s.id);
          students.push({ ...s, classes: [c.title] });
        } else {
          const existing = students.find((x) => x.id === s.id);
          if (existing) existing.classes.push(c.title);
        }
      }
    }

    res.json({ students, classes: classes.map((c) => ({ id: c.id, title: c.title })) });
  })
);

/**
 * POST /live/instant
 * Teacher starts an instant Jitsi meeting (no pre-scheduled entry needed).
 * Creates an ephemeral ClassSchedule row on the teacher's first class,
 * or requires a classId in the body.
 */
router.post(
  '/live/instant',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { classId } = req.body as { classId?: string };

    // Find the class to attach the instant meeting to
    let klass = classId
      ? await prisma.class.findFirst({ where: { id: classId, tenantId: req.tenant!.id } })
      : await prisma.class.findFirst({
          where:
            user.role === 'teacher'
              ? { tenantId: req.tenant!.id, teacherId: user.sub }
              : { tenantId: req.tenant!.id },
          orderBy: { createdAt: 'asc' },
        });

    if (!klass) throw notFound('No class found. Create a class first.');
    if (user.role === 'teacher' && klass.teacherId !== user.sub)
      throw forbidden('You can only start meetings for your own classes');

    const now = new Date();
    const dateOnly = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Create a schedule row tagged as live immediately
    const schedule = await prisma.classSchedule.create({
      data: {
        tenantId: req.tenant!.id,
        classId: klass.id,
        classDate: dateOnly,
        classTime: timeStr,
        platform: 'jitsi',
        meetingText: '',
        status: 'live',
        startedAt: now,
      },
    });

    const roomName = makeRoomName(req.tenant!.slug, schedule.id);
    await prisma.classSchedule.update({ where: { id: schedule.id }, data: { roomName } });

    const teacher = await prisma.user.findUnique({ where: { id: user.sub } });
    const jwt = makeJitsiToken({
      roomName,
      displayName: teacher?.name ?? 'Teacher',
      email: teacher?.email ?? '',
      isModerator: true,
    });

    res.json({
      scheduleId: schedule.id,
      classId: klass.id,
      className: klass.title,
      roomName,
      jitsiHost: env.jitsi.host,
      jwt,
    });
  })
);

/**
 * POST /live/instant/:scheduleId/invite
 * Send in-app notifications + emails to selected students or an entire class.
 * Body: { studentIds?: string[], classId?: string }
 */
router.post(
  '/live/instant/:scheduleId/invite',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;
    const { studentIds, classId: inviteClassId } = req.body as {
      studentIds?: string[];
      classId?: string;
    };

    const schedule = await prisma.classSchedule.findFirst({
      where: { id: scheduleId, tenantId: req.tenant!.id },
      include: { class: true },
    });
    if (!schedule || schedule.status !== 'live') throw notFound('Active session not found');
    if (req.user!.role === 'teacher' && schedule.class.teacherId !== req.user!.sub) {
      throw forbidden('You can only invite students to your own live classes');
    }

    const teacher = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    const joinUrl = `${env.clientUrl}/${req.tenant!.slug}/live`;
    const className = schedule.class.title;

    // Resolve target students
    let targets: { id: string; name: string; email: string }[] = [];

    if (inviteClassId) {
      if (inviteClassId !== schedule.classId) {
        throw forbidden('Invites must target the live session class');
      }
      const enrollments = await prisma.enrollment.findMany({
        where: { classId: schedule.classId, tenantId: req.tenant!.id, status: 'active' },
        include: { student: true },
      });
      targets = enrollments.map((e) => ({ id: e.student.id, name: e.student.name, email: e.student.email }));
    } else if (studentIds?.length) {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          classId: schedule.classId,
          tenantId: req.tenant!.id,
          status: 'active',
          studentId: { in: studentIds },
        },
        include: { student: { select: { id: true, name: true, email: true } } },
      });
      targets = enrollments.map((e) => e.student);
    }

    if (!targets.length) {
      return res.json({ invited: 0 });
    }

    // In-app notifications
    await createNotifications(
      targets.map((s) => ({
        tenantId: req.tenant!.id,
        userId: s.id,
        type: 'schedule_reminder' as const,
        title: `${teacher?.name ?? 'Your teacher'} started a live class`,
        body: `Join "${className}" now — class is live!`,
        link: joinUrl,
      }))
    );

    // Emails (fire-and-forget)
    Promise.allSettled(
      targets.map((s) =>
        sendLiveClassStarted({
          to: s.email,
          studentName: s.name,
          teacherName: teacher?.name ?? 'Your teacher',
          className,
          instituteName: req.tenant!.name,
          joinUrl,
          tenantId: req.tenant!.id,
        })
      )
    );

    res.json({ invited: targets.length });
  })
);

export default router;
