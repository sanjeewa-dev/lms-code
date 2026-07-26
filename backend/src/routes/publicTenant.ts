import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant, enterTenantContext } from '../middleware/tenant';

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

export default router;
