import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant, enterTenantContext } from '../middleware/tenant';
import { resolveParentToken } from '../services/parentTrust';
import { storage } from '../services/storage';
import {
  canAnonymousRegisterForClass,
  loadSelfEnrollmentPolicy,
} from '../services/selfEnrollmentPolicy';
import { notFound } from '../utils/httpError';

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
      prisma.event.findMany({
        where: { scope: 'all', isActive: true },
        orderBy: { eventDate: 'desc' },
        take: 10,
      }),
      prisma.videoLesson.findMany({
        where: { visibility: 'all' },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { batch: { select: { name: true } } },
      }),
    ]);

    res.json({
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        selfEnrollmentEnabled: tenant.selfEnrollmentEnabled,
      },
      notices,
      events,
      videos: videos.map(({ videoUrl: _videoUrl, ...video }) => video),
    });
  })
);

/** Public institute logo image (no auth). */
router.get(
  '/logo/:fileId',
  asyncHandler(async (req, res) => {
    const file = await prisma.file.findFirst({
      where: { id: req.params.fileId, kind: 'logo' },
    });
    if (!file) throw notFound('Logo not found');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
    storage.createReadStream(file.storageKey).pipe(res);
  })
);

/**
 * Public class lookup for registration.
 * Without classId: returns classes open to anonymous registration when policy allows.
 * With classId: returns that class only when anonymous registration is allowed.
 */
router.get(
  '/classes',
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId.trim() : '';
    const policy = await loadSelfEnrollmentPolicy(req.tenant!.id);

    if (classId) {
      if (!policy || !canAnonymousRegisterForClass(policy, classId)) {
        res.json({ classes: [] });
        return;
      }
      const klass = await prisma.class.findFirst({
        where: { id: classId, isPublished: true },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          teacher: { select: { id: true, name: true } },
          batch: { select: { id: true, name: true } },
        },
      });
      res.json({ classes: klass ? [{ ...klass, price: Number(klass.price) }] : [] });
      return;
    }

    if (!policy?.enabled) {
      res.json({ classes: [] });
      return;
    }

    let ids: string[] = [];
    if (policy.scope === 'all_classes') {
      const all = await prisma.class.findMany({
        where: { isPublished: true },
        select: { id: true },
      });
      ids = all.map((c) => c.id);
    } else {
      ids = policy.rules.filter((r) => r.audience === 'all_students').map((r) => r.targetClassId);
    }
    if (!ids.length) {
      res.json({ classes: [] });
      return;
    }

    const classes = await prisma.class.findMany({
      where: { id: { in: ids }, isPublished: true },
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
    res.json({ classes: classes.map((c) => ({ ...c, price: Number(c.price) })) });
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
