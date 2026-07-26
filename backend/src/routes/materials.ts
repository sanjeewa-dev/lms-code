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
import { studentHasContentAccess } from '../services/access';

const router = Router({ mergeParams: true });

// Shared field selector for material responses.
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
  createdAt: true,
} as const;

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
      },
      select: MATERIAL_SELECT,
    });

    res.status(201).json({ material });
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
    const material = await prisma.material.findFirst({ where: { id: req.params.materialId, classId: klass.id } });
    if (!material) throw notFound('Material not found');

    const data = materialSchema.partial().parse(req.body);
    const updated = await prisma.material.update({
      where: { id: material.id },
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate !== undefined ? data.dueDate : undefined,
        maxMarks: data.maxMarks !== undefined ? data.maxMarks : undefined,
      },
      select: MATERIAL_SELECT,
    });
    res.json({ material: updated });
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
    const materials = await prisma.material.findMany({
      where: { classId: req.params.classId },
      orderBy: { createdAt: 'desc' },
      select: MATERIAL_SELECT,
    });
    res.json({ materials });
  })
);

router.get(
  '/materials/:materialId/meta',
  authenticate,
  asyncHandler(async (req, res) => {
    const material = await loadMaterialWithAccess(req);
    res.json({ material: { ...material, hasFile: Boolean(material.fileId) } });
  })
);

router.get(
  '/materials/:materialId/pages/:pageNumber',
  authenticate,
  asyncHandler(async (req, res) => {
    const material = await loadMaterialWithAccess(req);
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

async function loadMaterialWithAccess(req: any) {
  const material = await prisma.material.findFirst({
    where: { id: req.params.materialId },
    include: { class: { select: { teacherId: true } } },
  });
  if (!material) throw notFound('Material not found');

  const user = req.user;
  if (user.role === 'admin' || user.role === 'superadmin') return material;
  if (material.class.teacherId === user.sub) return material;

  const access = await studentHasContentAccess({
    tenantId: req.tenant!.id,
    classId: material.classId,
    studentId: user.sub,
  });
  if (!access.ok) {
    throw forbidden(access.reason ?? 'You must have an approved enrollment to view this material');
  }
  return material;
}

export default router;
