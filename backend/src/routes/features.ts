import { Router, type Request } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { batchSchema, eventSchema, noticeSchema, videoLessonSchema } from '../validation/schemas';
import { badRequest, forbidden, notFound, unauthorized } from '../utils/httpError';
import type { AccessTokenPayload } from '../lib/jwt';
import { signWatchToken, verifyAccessToken, verifyWatchToken } from '../lib/jwt';
import { extractYouTubeId, extractVimeoId } from '../lib/videoEmbed';
import { studentHasContentAccess } from '../services/access';

const router = Router({ mergeParams: true });

const manage = [authenticate, requireRole('teacher', 'admin')];

/* ----------------------------- Batches ----------------------------- */
router.get(
  '/batches',
  authenticate,
  asyncHandler(async (_req, res) => {
    const batches = await prisma.batch.findMany({
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { classes: true } } },
    });
    res.json({ batches: batches.map((b) => ({ id: b.id, name: b.name, year: b.year, classCount: b._count.classes })) });
  })
);

router.post(
  '/batches',
  ...manage,
  asyncHandler(async (req, res) => {
    const data = batchSchema.parse(req.body);
    const batch = await prisma.batch.create({
      data: { tenantId: req.tenant!.id, name: data.name, year: data.year },
    });
    res.status(201).json({ batch });
  })
);

router.delete(
  '/batches/:id',
  ...manage,
  asyncHandler(async (req, res) => {
    const batch = await prisma.batch.findFirst({ where: { id: req.params.id } });
    if (!batch) throw notFound('Batch not found');
    await prisma.batch.delete({ where: { id: batch.id } });
    res.status(204).send();
  })
);

/* -------------------------- Video lessons -------------------------- */

function serializeVideoLesson(
  video: {
    id: string;
    title: string;
    description: string;
    provider: string;
    videoUrl: string;
    visibility: string;
    classId: string | null;
    batchId: string | null;
    createdAt: Date;
    class?: { title: string } | null;
    batch?: { name: string } | null;
  },
  includeUrl: boolean
) {
  const base = {
    id: video.id,
    title: video.title,
    description: video.description,
    provider: video.provider,
    visibility: video.visibility,
    classId: video.classId,
    batchId: video.batchId,
    class: video.class ?? null,
    batch: video.batch ?? null,
    createdAt: video.createdAt.toISOString(),
  };
  return includeUrl ? { ...base, videoUrl: video.videoUrl } : base;
}

async function assertVideoAccess(
  user: AccessTokenPayload,
  video: {
    visibility: string;
    classId: string | null;
    batchId: string | null;
  },
  tenantId: string
) {
  if (user.role === 'admin' || user.role === 'teacher' || user.role === 'superadmin') return;

  if (video.visibility === 'all') return;

  if (video.visibility === 'class') {
    if (!video.classId) throw forbidden('You do not have access to this video');
    const access = await studentHasContentAccess({
      tenantId,
      classId: video.classId,
      studentId: user.sub,
    });
    if (access.ok) return;
    throw forbidden(access.reason ?? 'You do not have access to this video');
  }

  if (video.visibility === 'batch' && video.batchId) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: user.sub,
        status: 'active',
        class: { batchId: video.batchId },
      },
      select: { classId: true },
    });
    for (const e of enrollments) {
      const access = await studentHasContentAccess({
        tenantId,
        classId: e.classId,
        studentId: user.sub,
      });
      if (access.ok) return;
    }
    throw forbidden('You do not have access to this video');
  }

  throw forbidden('You do not have access to this video');
}

function authenticateVideoAccess(req: Request, _res: unknown, next: (err?: unknown) => void) {
  const watchToken = req.query.watchToken as string | undefined;
  if (watchToken) {
    try {
      const payload = verifyWatchToken(watchToken);
      if (payload.videoId !== req.params.id) return next(unauthorized('Invalid watch token'));
      req.user = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: 'student',
        email: '',
        name: '',
      };
      return next();
    } catch {
      return next(unauthorized('Invalid or expired watch token'));
    }
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized('Missing or invalid Authorization header'));
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    return next();
  } catch {
    return next(unauthorized('Invalid or expired access token'));
  }
}

router.get(
  '/video-lessons',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    let where: any = {};

    if (user.role === 'student') {
      const classIds = await getStudentClassIds(user.sub);
      where = {
        OR: [
          { visibility: 'all' },
          { visibility: 'class', classId: { in: classIds } },
          { visibility: 'batch', batch: { classes: { some: { id: { in: classIds } } } } },
        ],
      };
    }

    const videos = await prisma.videoLesson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { class: { select: { title: true } }, batch: { select: { name: true } } },
    });

    const includeUrl = user.role === 'admin' || user.role === 'teacher';
    res.json({ videos: videos.map((v) => serializeVideoLesson(v, includeUrl)) });
  })
);

router.get(
  '/video-lessons/:id/play',
  authenticate,
  asyncHandler(async (req, res) => {
    const video = await prisma.videoLesson.findFirst({
      where: { id: req.params.id },
    });
    if (!video) throw notFound('Video lesson not found');

    await assertVideoAccess(req.user!, video, req.tenant!.id);

    if (video.provider === 'url') {
      const watchToken = signWatchToken({
        sub: req.user!.sub,
        videoId: video.id,
        tenantId: req.tenant!.id,
      });
      const slug = req.params.slug;
      return res.json({
        kind: 'stream' as const,
        streamUrl: `/api/t/${slug}/video-lessons/${video.id}/stream?watchToken=${watchToken}`,
      });
    }

    if (video.provider === 'youtube') {
      const videoId = extractYouTubeId(video.videoUrl);
      if (!videoId) throw badRequest('Invalid YouTube URL');
      return res.json({ kind: 'youtube' as const, videoId });
    }

    if (video.provider === 'vimeo') {
      const videoId = extractVimeoId(video.videoUrl);
      if (!videoId) throw badRequest('Invalid Vimeo URL');
      return res.json({ kind: 'vimeo' as const, videoId });
    }

    throw badRequest('Unsupported video provider');
  })
);

router.get(
  '/video-lessons/:id/stream',
  authenticateVideoAccess,
  asyncHandler(async (req, res) => {
    const video = await prisma.videoLesson.findFirst({ where: { id: req.params.id } });
    if (!video) throw notFound('Video lesson not found');
    if (video.provider !== 'url') throw badRequest('This video is not streamable');

    await assertVideoAccess(req.user!, video, req.tenant!.id);

    const range = req.headers.range;
    const upstream = await fetch(video.videoUrl, {
      headers: range ? { Range: range } : {},
    });

    if (!upstream.ok && upstream.status !== 206) {
      throw badRequest('Unable to load video stream');
    }

    res.status(upstream.status);
    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    for (const key of passHeaders) {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');

    if (upstream.body) {
      const { Readable } = await import('stream');
      Readable.fromWeb(upstream.body as import('stream/web').ReadableStream).pipe(res);
    } else {
      res.end();
    }
  })
);

router.post(
  '/video-lessons',
  ...manage,
  asyncHandler(async (req, res) => {
    const data = videoLessonSchema.parse(req.body);
    const video = await prisma.videoLesson.create({
      data: {
        tenantId: req.tenant!.id,
        title: data.title,
        description: data.description ?? '',
        provider: data.provider,
        videoUrl: data.videoUrl,
        visibility: data.visibility,
        classId: data.visibility === 'class' ? data.classId || null : null,
        batchId: data.visibility === 'batch' ? data.batchId || null : null,
      },
      include: { class: { select: { title: true } }, batch: { select: { name: true } } },
    });
    res.status(201).json({ video: serializeVideoLesson(video, true) });
  })
);

router.delete(
  '/video-lessons/:id',
  ...manage,
  asyncHandler(async (req, res) => {
    const video = await prisma.videoLesson.findFirst({ where: { id: req.params.id } });
    if (!video) throw notFound('Video lesson not found');
    await prisma.videoLesson.delete({ where: { id: video.id } });
    res.status(204).send();
  })
);

/* ----------------------------- Notices ----------------------------- */

const NOTICE_INCLUDE = {
  classes: { include: { class: { select: { id: true, title: true } } } },
} as const;

function formatNotice(
  notice: {
    id: string;
    title: string;
    body: string;
    pinned: boolean;
    scope: string;
    publishedAt: Date;
    classes: { class: { id: string; title: string } }[];
  },
  readIds?: Set<string>
) {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    pinned: notice.pinned,
    scope: notice.scope,
    publishedAt: notice.publishedAt,
    classes: notice.classes.map((nc) => nc.class),
    isRead: readIds ? readIds.has(notice.id) : undefined,
  };
}

async function getStudentClassIds(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: userId, status: 'active' },
    select: { classId: true },
  });
  return enrollments.map((e) => e.classId);
}

async function getTeacherClassIds(userId: string) {
  const classes = await prisma.class.findMany({
    where: { teacherId: userId },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

async function getVisibleNoticeWhere(user: AccessTokenPayload) {
  if (user.role === 'admin') return {};

  if (user.role === 'teacher') {
    const classIds = await getTeacherClassIds(user.sub);
    return {
      OR: [
        { scope: 'all' as const },
        { classes: { some: { classId: { in: classIds } } } },
      ],
    };
  }

  const classIds = await getStudentClassIds(user.sub);
  return {
    OR: [
      { scope: 'all' as const },
      { classes: { some: { classId: { in: classIds } } } },
    ],
  };
}

async function getReadIds(userId: string, noticeIds: string[]) {
  if (noticeIds.length === 0) return new Set<string>();
  const reads = await prisma.noticeRead.findMany({
    where: { userId, noticeId: { in: noticeIds } },
    select: { noticeId: true },
  });
  return new Set(reads.map((r) => r.noticeId));
}

router.get(
  '/notices/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const where = await getVisibleNoticeWhere(user);
    const notices = await prisma.notice.findMany({ where, select: { id: true } });
    const noticeIds = notices.map((n) => n.id);
    const readIds = await getReadIds(user.sub, noticeIds);
    res.json({ count: noticeIds.filter((id) => !readIds.has(id)).length });
  })
);

router.get(
  '/notices',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const where = await getVisibleNoticeWhere(user);
    const notices = await prisma.notice.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      include: NOTICE_INCLUDE,
    });
    const readIds = await getReadIds(
      user.sub,
      notices.map((n) => n.id)
    );
    res.json({ notices: notices.map((n) => formatNotice(n, readIds)) });
  })
);

router.post(
  '/notices/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const where = await getVisibleNoticeWhere(user);
    const notice = await prisma.notice.findFirst({
      where: { id: req.params.id, ...where },
    });
    if (!notice) throw notFound('Notice not found');

    await prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId: notice.id, userId: user.sub } },
      create: { noticeId: notice.id, userId: user.sub },
      update: { readAt: new Date() },
    });
    res.json({ ok: true });
  })
);

router.post(
  '/notices',
  ...manage,
  asyncHandler(async (req, res) => {
    const data = noticeSchema.parse(req.body);
    const user = req.user!;

    let classIds: string[] = [];
    if (data.scope === 'classes' && data.classIds) {
      const classes = await prisma.class.findMany({
        where: { id: { in: data.classIds } },
        select: { id: true, teacherId: true },
      });
      if (classes.length !== data.classIds.length) {
        throw badRequest('One or more classes are invalid');
      }
      if (user.role === 'teacher') {
        const invalid = classes.some((c) => c.teacherId !== user.sub);
        if (invalid) throw forbidden('You can only post notices to your own classes');
      }
      classIds = classes.map((c) => c.id);
    }

    const notice = await prisma.notice.create({
      data: {
        tenantId: req.tenant!.id,
        title: data.title,
        body: data.body ?? '',
        pinned: data.pinned ?? false,
        scope: data.scope,
        classes:
          classIds.length > 0
            ? { create: classIds.map((classId) => ({ classId })) }
            : undefined,
        reads: { create: { userId: user.sub } },
      },
      include: NOTICE_INCLUDE,
    });
    res.status(201).json({ notice: formatNotice(notice) });
  })
);

router.delete(
  '/notices/:id',
  ...manage,
  asyncHandler(async (req, res) => {
    const notice = await prisma.notice.findFirst({ where: { id: req.params.id } });
    if (!notice) throw notFound('Notice not found');
    await prisma.notice.delete({ where: { id: notice.id } });
    res.status(204).send();
  })
);

/* ------------------------------ Events ----------------------------- */
router.get(
  '/events',
  authenticate,
  asyncHandler(async (_req, res) => {
    const events = await prisma.event.findMany({ orderBy: { eventDate: 'desc' } });
    res.json({ events });
  })
);

router.post(
  '/events',
  ...manage,
  asyncHandler(async (req, res) => {
    const data = eventSchema.parse(req.body);
    const event = await prisma.event.create({
      data: {
        tenantId: req.tenant!.id,
        title: data.title,
        body: data.body ?? '',
        eventDate: data.eventDate,
        batchLabel: data.batchLabel,
      },
    });
    res.status(201).json({ event });
  })
);

router.delete(
  '/events/:id',
  ...manage,
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findFirst({ where: { id: req.params.id } });
    if (!event) throw notFound('Event not found');
    await prisma.event.delete({ where: { id: event.id } });
    res.status(204).send();
  })
);

export default router;
