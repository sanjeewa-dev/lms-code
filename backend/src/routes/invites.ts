import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant } from '../middleware/tenant';
import { studentOnboardingSchema } from '../validation/schemas';
import { acceptInvite, getInviteForToken } from '../services/studentInvite';
import { SRI_LANKAN_DISTRICTS } from '../constants/districts';

// Mounted at /api/t/:slug/invites — public (no auth).
const router = Router({ mergeParams: true });

router.use(resolveTenant);

router.get(
  '/districts',
  asyncHandler(async (_req, res) => {
    res.json({ districts: SRI_LANKAN_DISTRICTS });
  })
);

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const result = await getInviteForToken(req.tenant!.id, req.params.token);
    res.json(result);
  })
);

router.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const data = studentOnboardingSchema.parse(req.body);
    const { student } = await acceptInvite(req.tenant!.id, req.params.token, data);
    res.json({
      success: true,
      message: 'Registration complete. You can now sign in.',
      student: { id: student.id, name: student.name, email: student.email },
    });
  })
);

export default router;
