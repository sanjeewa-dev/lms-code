import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';

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
        classDate: { gte: today },
        ...(Object.keys(classFilter).length ? { class: classFilter } : {}),
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

    res.json({
      sessions: schedules.map((s) => ({
        id: s.id,
        classDate: s.classDate,
        classTime: s.classTime,
        platform: s.platform,
        meetingText: s.meetingText,
        class: s.class,
      })),
    });
  })
);

export default router;
