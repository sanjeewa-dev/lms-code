import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

router.get(
  '/notifications',
  authenticate,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ notifications });
  })
);

router.get(
  '/notifications/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const [notifCount, noticeCount] = await Promise.all([
      prisma.notification.count({
        where: { userId: req.user!.sub, readAt: null },
      }),
      // Keep announcement unread count available for the bell.
      (async () => {
        const reads = await prisma.noticeRead.findMany({
          where: { userId: req.user!.sub },
          select: { noticeId: true },
        });
        const readIds = new Set(reads.map((r) => r.noticeId));
        const notices = await prisma.notice.findMany({ select: { id: true } });
        return notices.filter((n) => !readIds.has(n.id)).length;
      })(),
    ]);
    res.json({ count: notifCount + noticeCount, notifications: notifCount, notices: noticeCount });
  })
);

router.post(
  '/notifications/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!n) throw notFound('Notification not found');
    const updated = await prisma.notification.update({
      where: { id: n.id },
      data: { readAt: new Date() },
    });
    res.json({ notification: updated });
  })
);

router.post(
  '/notifications/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.sub, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  })
);

export default router;
