import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant } from '../middleware/tenant';
import { authenticate, requireRole } from '../middleware/auth';
import { classJoinRegisterSchema } from '../validation/schemas';
import {
  enrollViaClassInvite,
  getClassJoinInfo,
  registerViaClassInvite,
} from '../services/classInviteLink';

// Mounted at /api/t/:slug/join — public + authenticated enroll.
const router = Router({ mergeParams: true });

router.use(resolveTenant);

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const info = await getClassJoinInfo(req.tenant!.id, req.params.token);
    res.json(info);
  })
);

router.post(
  '/:token/register',
  asyncHandler(async (req, res) => {
    const data = classJoinRegisterSchema.parse(req.body);
    const result = await registerViaClassInvite({
      tenantId: req.tenant!.id,
      token: req.params.token,
      name: data.name,
      email: data.email,
      password: data.password,
    });
    res.status(201).json({
      success: true,
      pending: result.enrollmentStatus === 'pending',
      message:
        result.enrollmentStatus === 'pending'
          ? 'Registration complete. Complete payment to access this class.'
          : 'Registration complete. You can sign in now.',
      ...result,
    });
  })
);

/** Logged-in student enrolls into the class for this invite link. */
router.post(
  '/:token/enroll',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const result = await enrollViaClassInvite({
      tenantId: req.tenant!.id,
      token: req.params.token,
      studentId: req.user!.sub,
    });
    res.status(result.alreadyEnrolled ? 200 : 201).json({
      success: true,
      alreadyEnrolled: result.alreadyEnrolled,
      class: result.class,
      enrollment: {
        id: result.enrollment.id,
        status: result.enrollment.status,
      },
    });
  })
);

export default router;
