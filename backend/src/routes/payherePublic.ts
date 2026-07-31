import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveTenant, enterTenantContext } from '../middleware/tenant';
import { processPayHereNotify } from '../services/payhere';

// Mounted at /api/t/:slug/public — PayHere IPN (no auth).
const router = Router({ mergeParams: true });

router.post(
  '/payhere/notify',
  resolveTenant,
  enterTenantContext,
  express.urlencoded({ extended: false }),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string>;
    const result = await processPayHereNotify(req.tenant!.id, body);
    // PayHere expects a 200 response.
    res.status(200).send(result.ok ? 'OK' : 'FAIL');
  })
);

export default router;
