import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { basePrisma } from '../lib/prisma';
import {
  sendFeeRemindersForTenant,
  sendParentDigestsForTenant,
} from '../services/smartJobs';
import { computeAtRiskStudents, nudgeAtRiskStudent } from '../services/atRisk';
import { explainQuizQuestion, weakTopicsForStudent } from '../services/aiCoach';
import { z } from 'zod';

const router = Router({ mergeParams: true });

router.post(
  '/smart/fee-reminders/run',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await sendFeeRemindersForTenant(req.tenant!.id, { force: true });
    res.json(result);
  })
);

router.post(
  '/smart/parent-digests/run',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await sendParentDigestsForTenant(req.tenant!.id);
    res.json(result);
  })
);

router.get(
  '/smart/at-risk',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const students = await computeAtRiskStudents(req.tenant!.id);
    // Teachers only see students in their classes.
    if (req.user!.role === 'teacher') {
      const myClasses = await basePrisma.class.findMany({
        where: { tenantId: req.tenant!.id, teacherId: req.user!.sub },
        select: { id: true },
      });
      const ids = new Set(myClasses.map((c) => c.id));
      res.json({
        students: students.filter((s) => s.classIds.some((id) => ids.has(id))),
      });
      return;
    }
    res.json({ students });
  })
);

router.post(
  '/smart/at-risk/:studentId/nudge',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const tenant = await basePrisma.tenant.findFirst({ where: { id: req.tenant!.id } });
    const result = await nudgeAtRiskStudent({
      tenantId: req.tenant!.id,
      tenantSlug: tenant?.slug ?? req.params.slug,
      tenantName: tenant?.name ?? 'Institute',
      studentId: req.params.studentId,
      staffName: req.user!.name || 'Staff',
    });
    res.json(result);
  })
);

const explainSchema = z.object({
  questionId: z.string().min(1),
});

router.post(
  '/smart/ai/attempts/:attemptId/explain',
  authenticate,
  requireRole('student', 'teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const { questionId } = explainSchema.parse(req.body);
    const result = await explainQuizQuestion({
      attemptId: req.params.attemptId,
      questionId,
      userId: req.user!.sub,
      role: req.user!.role,
    });
    res.json(result);
  })
);

router.get(
  '/smart/ai/weak-topics',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const result = await weakTopicsForStudent({ studentId: req.user!.sub, classId });
    res.json(result);
  })
);

export default router;
