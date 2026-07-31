import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listInterventions,
  createIntervention,
  updateIntervention,
  getInterventionTimeline,
} from '../services/intervention';

const router = Router({ mergeParams: true });

router.get(
  '/interventions',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const interventions = await listInterventions({
      tenantId: req.tenant!.id,
      studentId,
      status: status as any,
    });
    res.json({ interventions });
  })
);

router.get(
  '/interventions/timeline/:studentId',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const timeline = await getInterventionTimeline({
      tenantId: req.tenant!.id,
      studentId: req.params.studentId,
    });
    res.json({ timeline });
  })
);

const createSchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(5).max(2000),
  action: z.string().min(5).max(2000),
  followUpDate: z.string().optional(),
});

router.post(
  '/interventions',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const intervention = await createIntervention({
      tenantId: req.tenant!.id,
      createdById: req.user!.sub,
      ...data,
    });
    res.status(201).json({ intervention });
  })
);

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'escalated']).optional(),
  action: z.string().min(5).max(2000).optional(),
  followUpDate: z.string().nullable().optional(),
  resolvedNote: z.string().max(2000).optional(),
});

router.patch(
  '/interventions/:id',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const intervention = await updateIntervention({
      tenantId: req.tenant!.id,
      id: req.params.id,
      updaterId: req.user!.sub,
      updaterRole: req.user!.role,
      ...data,
    });
    res.json({ intervention });
  })
);

export default router;
