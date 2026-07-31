import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant } from '../middleware/tenant';
import { adminOnboardingSchema } from '../validation/schemas';
import {
  acceptAdminInvite,
  getAdminInviteForToken,
} from '../services/adminInvite';

// Mounted at /api/t/:slug/admin-invites — public (no auth).
const router = Router({ mergeParams: true });

router.use(resolveTenant);

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const result = await getAdminInviteForToken(req.tenant!.id, req.params.token);
    res.json(result);
  })
);

router.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const data = adminOnboardingSchema.parse(req.body);
    const { admin } = await acceptAdminInvite(req.tenant!.id, req.params.token, data);
    res.json({
      success: true,
      message: 'Account setup complete. You can now sign in.',
      admin: { id: admin.id, name: admin.name, email: admin.email },
    });
  })
);

export default router;
