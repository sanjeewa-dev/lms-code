import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { sendParentMagicLink, resolveParentToken } from '../services/parentTrust';

const router = Router({ mergeParams: true });

/** Staff sends magic link to guardian. */
router.post(
  '/parent-trust/send-link/:studentId',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const result = await sendParentMagicLink({
      tenantId: req.tenant!.id,
      tenantSlug: req.tenant!.slug,
      tenantName: req.tenant!.name,
      studentId: req.params.studentId,
    });
    res.json(result);
  })
);

export default router;
