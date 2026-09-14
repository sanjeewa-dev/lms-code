import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadMaterial } from '../middleware/upload';
import { materialSchema } from '../validation/schemas';
import { persistUploadedFile } from '../services/files';
import { storage } from '../services/storage';
import { getPageCount, renderWatermarkedPage } from '../services/pdf';
import { badRequest, forbidden, notFound } from '../utils/httpError';
import { basePrisma } from '../lib/prisma';
import { studentHasContentAccess, studentHasMaterialAccess } from '../services/access';

const router = Router({ mergeParams: true });

const MATERIAL_SELECT = {
  id: true,
  title: true,
  description: true,
  kind: true,
  pageCount: true,
  viewOnly: true,
  dueDate: true,
  maxMarks: true,
  fileId: true,
  price: true,
  published: true,
  classId: true,
  createdAt: true,
} as const;

function serializeMaterial(
  m: any,
  extras?: {
    purchaseStatus?: 'none' | 'pending' | 'approved' | 'rejected';
    canPreview?: boolean;
  }
) {
  const price = Number(m.price ?? 0);
  const purchaseStatus = extras?.purchaseStatus ?? 'none';
  const canPreview =
    extras?.canPreview ??
    (price <= 0 || purchaseStatus === 'approved');
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    kind: m.kind,
    pageCount: m.pageCount,
    viewOnly: m.viewOnly,
    dueDate: m.dueDate,
    maxMarks: m.maxMarks,
    fileId: m.fileId,
    classId: m.classId,
    price,
    published: m.published !== false,
    createdAt: m.createdAt,
    purchaseStatus,
    canPreview,
    hasFile: Boolean(m.fileId),
  };
}

// Upload a view-only material OR a teacher assessment file.
router.post(
  '/classes/:classId/materials',
  authenticate,
  requireRole('teacher', 'admin'),
  uploadMaterial,
  enterTenantContext,
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only add materials to your own classes');
    }

    const data = materialSchema.parse(req.body);

    let fileId: string | undefined;
    let pageCount = 0;
    if (req.file) {
      pageCount = await getPageCount(req.file.buffer, req.file.mimetype);
      const file = await persistUploadedFile(req.file, req.user!.sub, 'material');
      fileId = file.id;
    } else if (data.kind === 'material') {
      throw badRequest('A file is required for materials');
    }

    const material = await prisma.material.create({
      data: {
        tenantId: req.tenant!.id,
        classId: klass.id,
        title: data.title,
        description: data.description ?? '',
        kind: data.kind,
        fileId: fileId ?? null,
        pageCount,
        viewOnly: true,
        dueDate: data.dueDate ?? null,
        maxMarks: data.maxMarks ?? null,
        price: data.price ?? 0,
        published: data.published ?? true,
      },
      select: MATERIAL_SELECT,
    });

    res.status(201).json({ material: serializeMaterial(material, { canPreview: true }) });
  })
);

// Update a material / assignment (no file replacement — just metadata).
router.patch(
  '/classes/:classId/materials/:materialId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only edit materials in your own classes');
    }
    const material = await prisma.material.findFirst({
      where: { id: req.params.materialId, classId: klass.id },
    });
    if (!material) throw notFound('Material not found');

    const data = materialSchema.partial().parse(req.body);
    const updated = await prisma.material.update({
      where: { id: material.id },
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate !== undefined ? data.dueDate : undefined,
        maxMarks: data.maxMarks !== undefined ? data.maxMarks : undefined,
        price: data.price !== undefined ? data.price : undefined,
        published: data.published !== undefined ? data.published : undefined,
      },
      select: MATERIAL_SELECT,
    });
    res.json({ material: serializeMaterial(updated, { canPreview: true }) });
  })
);

// Delete a material / assignment.
router.delete(
  '/classes/:classId/materials/:materialId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    if (!klass) throw notFound('Class not found');
    if (req.user!.role === 'teacher' && klass.teacherId !== req.user!.sub) {
      throw forbidden('You can only delete materials in your own classes');
    }
    const material = await prisma.material.findFirst({
      where: { id: req.params.materialId, classId: klass.id },
      include: { file: true },
    });
    if (!material) throw notFound('Material not found');

    await prisma.material.delete({ where: { id: material.id } });
    if (material.file) {
      await storage.remove(material.file.storageKey).catch(() => undefined);
      await basePrisma.file.delete({ where: { id: material.file.id } }).catch(() => undefined);
    }
    res.status(204).send();
  })
);

router.get(
  '/classes/:classId/materials',
  authenticate,
  requireActiveEnrollment('classId'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const isStaff =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      user.role === 'teacher';

    const materials = await prisma.material.findMany({
      where: {
        classId: req.params.classId,
        ...(isStaff ? {} : { published: true }),
      },
      orderBy: { createdAt: 'desc' },
      select: MATERIAL_SELECT,
    });

    if (isStaff) {
      res.json({
        materials: materials.map((m) =>
          serializeMaterial(m, { canPreview: true, purchaseStatus: 'none' })
        ),
      });
      return;
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        classId: req.params.classId,
        studentId: user.sub,
        status: 'active',
      },
      select: { id: true },
    });

    const payments = enrollment
      ? await prisma.payment.findMany({
          where: {
            enrollmentId: enrollment.id,
            paymentType: 'material',
            materialId: { in: materials.map((m) => m.id) },
          },
          orderBy: { createdAt: 'desc' },
          select: { materialId: true, status: true },
        })
      : [];

    const statusByMaterial = new Map<string, 'pending' | 'approved' | 'rejected'>();
    for (const p of payments) {
      if (!p.materialId || statusByMaterial.has(p.materialId)) continue;
      statusByMaterial.set(p.materialId, p.status as 'pending' | 'approved' | 'rejected');
    }

    res.json({
      materials: materials.map((m) => {
        const price = Number(m.price);
        const purchaseStatus = statusByMaterial.get(m.id) ?? 'none';
        const canPreview = price <= 0 || purchaseStatus === 'approved';
        return serializeMaterial(m, { purchaseStatus, canPreview });
      }),
    });
  })
);

router.get(
  '/materials/:materialId/meta',
  authenticate,
  asyncHandler(async (req, res) => {
    const { material, purchaseStatus, canPreview } = await loadMaterialAccessContext(req, {
      requireFullPreview: false,
    });
    res.json({
      material: {
        ...serializeMaterial(material, { purchaseStatus, canPreview }),
        hasFile: Boolean(material.fileId),
      },
    });
  })
);

/** Page-1 thumbnail available to enrolled students even before material payment. */
router.get(
  '/materials/:materialId/thumbnail',
  authenticate,
  asyncHandler(async (req, res) => {
    const { material } = await loadMaterialAccessContext(req, {
      requireFullPreview: false,
      thumbnailOnly: true,
    });
    if (!material.fileId) throw badRequest('This material has no viewable file');

    const fullMaterial = await prisma.material.findFirst({
      where: { id: material.id },
      include: { file: true },
    });
    if (!fullMaterial?.file) throw notFound('File not found');

    const original = await storage.read(fullMaterial.file.storageKey);
    const watermark = `${req.user!.name} - ${req.user!.email}`;
    const image = await renderWatermarkedPage(original, fullMaterial.file.mimeType, 1, watermark);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.send(image);
  })
);

router.get(
  '/materials/:materialId/pages/:pageNumber',
  authenticate,
  asyncHandler(async (req, res) => {
    const { material } = await loadMaterialAccessContext(req, { requireFullPreview: true });
    if (!material.fileId) throw badRequest('This material has no viewable file');
    const pageNumber = parseInt(req.params.pageNumber, 10);
    if (Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > material.pageCount) {
      throw badRequest('Invalid page number');
    }

    const fullMaterial = await prisma.material.findFirst({
      where: { id: material.id },
      include: { file: true },
    });
    if (!fullMaterial?.file) throw notFound('File not found');

    const original = await storage.read(fullMaterial.file.storageKey);
    const watermark = `${req.user!.name} - ${req.user!.email}`;
    const image = await renderWatermarkedPage(original, fullMaterial.file.mimeType, pageNumber, watermark);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.send(image);
  })
);

async function loadMaterialAccessContext(
  req: any,
  opts: { requireFullPreview: boolean; thumbnailOnly?: boolean }
) {
  const material = await prisma.material.findFirst({
    where: { id: req.params.materialId },
    include: { class: { select: { teacherId: true } } },
  });
  if (!material) throw notFound('Material not found');

  const user = req.user;
  if (user.role === 'admin' || user.role === 'superadmin' || material.class.teacherId === user.sub) {
    return {
      material,
      purchaseStatus: 'none' as const,
      canPreview: true,
    };
  }

  if (!material.published && Number(material.price) > 0) {
    throw notFound('Material not found');
  }

  const classAccess = await studentHasContentAccess({
    tenantId: req.tenant!.id,
    classId: material.classId,
    studentId: user.sub,
  });
  if (!classAccess.ok) {
    throw forbidden(classAccess.reason ?? 'You must have an approved enrollment to view this material');
  }

  const materialAccess = await studentHasMaterialAccess({
    tenantId: req.tenant!.id,
    materialId: material.id,
    studentId: user.sub,
  });

  if (opts.requireFullPreview && !materialAccess.ok) {
    throw forbidden(materialAccess.reason ?? 'Purchase required to preview this material');
  }

  return {
    material,
    purchaseStatus: materialAccess.purchaseStatus,
    canPreview: materialAccess.ok,
  };
}

export default router;
