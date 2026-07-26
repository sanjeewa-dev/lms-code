import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { basePrisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { publicUserFromProfile, serializeProfile } from '../services/profile';
import { changePasswordSchema, profileUpdateSchema } from '../validation/schemas';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError';

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
    }

    if (user.role === 'student') {
      if (data.guardianName !== undefined) update.guardianName = data.guardianName || null;
      if (data.guardianPhone !== undefined) update.guardianPhone = data.guardianPhone || null;
      if (data.area !== undefined) update.area = data.area || null;
      if (data.district !== undefined) update.district = data.district || null;
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

    res.json({ ok: true });
  })
);

export default router;
