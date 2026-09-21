import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { basePrisma, prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { enterTenantContext } from '../middleware/tenant';
import { uploadShippingLabelPhoto } from '../middleware/upload';
import { persistUploadedFile } from '../services/files';
import { publicUserFromProfile, serializeProfile } from '../services/profile';
import { storage } from '../services/storage';
import { changePasswordSchema, profileUpdateSchema } from '../validation/schemas';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/httpError';
import { revokeRefreshTokensForUser } from '../services/auth';

const router = Router({ mergeParams: true });

const profileInclude = { tenant: { select: { slug: true, name: true } } } as const;

async function loadOwnUser(userId: string, tenantId: string) {
  const user = await basePrisma.user.findFirst({
    where: { id: userId, tenantId },
    include: profileInclude,
  });
  if (!user) throw notFound('Profile not found');
  return user;
}

async function streamShippingLabelPhoto(fileId: string, res: import('express').Response) {
  const file = await prisma.file.findFirst({
    where: { id: fileId, kind: 'shipping_label' },
  });
  if (!file) throw notFound('Shipping label photo not found');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
  storage.createReadStream(file.storageKey).pipe(res);
}

router.get(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await loadOwnUser(req.user!.sub, req.tenant!.id);
    res.json({ profile: serializeProfile(user) });
  })
);

router.patch(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenant!.id;
    const user = await loadOwnUser(req.user!.sub, tenantId);

    const raw = { ...req.body } as Record<string, unknown>;
    for (const key of ['name', 'email'] as const) {
      if (raw[key] === '') delete raw[key];
    }
    const data = profileUpdateSchema.parse(raw);

    if (data.email && data.email !== user.email) {
      const clash = await basePrisma.user.findFirst({
        where: { tenantId, email: data.email, id: { not: user.id } },
      });
      if (clash) throw conflict('A user with that email already exists in this institute');
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.email !== undefined) update.email = data.email;
    if (data.phone !== undefined) update.phone = data.phone || null;

    if (user.role === 'teacher') {
      if (data.subject !== undefined) update.subject = data.subject || null;
      if (data.address !== undefined) update.address = data.address || null;
      if (data.shippingLabelPhotoOnly !== undefined) {
        update.shippingLabelPhotoOnly = data.shippingLabelPhotoOnly;
      }
    }

    if (user.role === 'student') {
      if (data.guardianName !== undefined) update.guardianName = data.guardianName || null;
      if (data.guardianPhone !== undefined) update.guardianPhone = data.guardianPhone || null;
      if (data.guardianEmail !== undefined) update.guardianEmail = data.guardianEmail || null;
      if (data.area !== undefined) update.area = data.area || null;
      if (data.district !== undefined) update.district = data.district || null;
      if (data.school !== undefined) update.school = data.school || null;
      if (data.address !== undefined) update.address = data.address || null;
    }

    const updated = await basePrisma.user.update({
      where: { id: user.id },
      data: update,
      include: profileInclude,
    });

    res.json({
      profile: serializeProfile(updated),
      user: publicUserFromProfile(updated),
    });
  })
);

router.post(
  '/profile/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = changePasswordSchema.parse(req.body);
    const user = await basePrisma.user.findFirst({
      where: { id: req.user!.sub, tenantId: req.tenant!.id },
    });
    if (!user) throw notFound('Profile not found');
    if (!user.passwordHash) {
      throw badRequest('Your account has no password set. Complete your invite registration first.');
    }

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) throw unauthorized('Current password is incorrect');

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await basePrisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await revokeRefreshTokensForUser(user.id);

    res.json({ ok: true });
  })
);

/** Stream own shipping-label photo (auth required — used when printing). */
router.get(
  '/profile/shipping-label-photo',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await loadOwnUser(req.user!.sub, req.tenant!.id);
    if (user.role !== 'teacher' && user.role !== 'admin') {
      throw forbidden('Only teachers have shipping label photos');
    }
    if (!user.shippingLabelPhotoFileId) throw notFound('No shipping label photo uploaded');
    await streamShippingLabelPhoto(user.shippingLabelPhotoFileId, res);
  })
);

/** Upload / replace teacher shipping-label branding photo. */
router.post(
  '/profile/shipping-label-photo',
  authenticate,
  requireRole('teacher'),
  uploadShippingLabelPhoto,
  // Multer resumes outside ALS — re-enter tenant context before DB write.
  enterTenantContext,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Please choose a photo (JPEG, PNG, WebP, or GIF)');
    const user = await loadOwnUser(req.user!.sub, req.tenant!.id);
    const previousFileId = user.shippingLabelPhotoFileId;

    const file = await persistUploadedFile(req.file, req.user!.sub, 'shipping_label');
    const updated = await basePrisma.user.update({
      where: { id: user.id },
      data: { shippingLabelPhotoFileId: file.id },
      include: profileInclude,
    });

    if (previousFileId && previousFileId !== file.id) {
      const old = await prisma.file.findFirst({ where: { id: previousFileId, kind: 'shipping_label' } });
      if (old) {
        await prisma.file.delete({ where: { id: old.id } }).catch(() => undefined);
        await storage.remove(old.storageKey).catch(() => undefined);
      }
    }

    res.json({ profile: serializeProfile(updated) });
  })
);

/** Remove teacher shipping-label photo. */
router.delete(
  '/profile/shipping-label-photo',
  authenticate,
  requireRole('teacher'),
  asyncHandler(async (req, res) => {
    const user = await loadOwnUser(req.user!.sub, req.tenant!.id);
    const fileId = user.shippingLabelPhotoFileId;
    const updated = await basePrisma.user.update({
      where: { id: user.id },
      data: { shippingLabelPhotoFileId: null, shippingLabelPhotoOnly: false },
      include: profileInclude,
    });
    if (fileId) {
      const old = await prisma.file.findFirst({ where: { id: fileId, kind: 'shipping_label' } });
      if (old) {
        await prisma.file.delete({ where: { id: old.id } }).catch(() => undefined);
        await storage.remove(old.storageKey).catch(() => undefined);
      }
    }
    res.json({ profile: serializeProfile(updated) });
  })
);

export default router;
