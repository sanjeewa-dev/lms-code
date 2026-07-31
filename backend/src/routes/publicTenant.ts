import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant, enterTenantContext } from '../middleware/tenant';
import { resolveParentToken } from '../services/parentTrust';

// Mounted at /api/t/:slug/public - no authentication required.
const router = Router({ mergeParams: true });

router.use(resolveTenant, enterTenantContext);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenant = req.tenant!;
    const [notices, events, videos] = await Promise.all([
      prisma.notice.findMany({
        where: { scope: 'all' },
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        take: 10,
      }),
      prisma.event.findMany({ orderBy: { eventDate: 'desc' }, take: 10 }),
      prisma.videoLesson.findMany({
        where: { visibility: 'all' },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { batch: { select: { name: true } } },
      }),
    ]);

    res.json({
      tenant: { name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl },
      notices,
      events,
      videos: videos.map(({ videoUrl: _videoUrl, ...video }) => video),
    });
  })
);

/** Published classes available for student self-registration / browse. */
router.get(
  '/classes',
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        teacher: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
      },
      orderBy: { title: 'asc' },
    });
    res.json({
      classes: classes.map((c) => ({
        ...c,
        price: Number(c.price),
      })),
    });
  })
);

/** Parent Trust Center — resolve a magic-link token. */
router.get(
  '/parent-report',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ error: 'token is required' });
    const report = await resolveParentToken(token, req.tenant!.id);
    res.json(report);
  })
);

export default router;
