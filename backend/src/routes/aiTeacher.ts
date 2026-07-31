import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import {
  teacherGenerateQuiz,
  teacherDraftFeedback,
  teacherWeakTopicSummary,
  teacherInterventionSuggestions,
  listTeacherAiHistory,
  type TeacherAiToolId,
} from '../services/aiTeacher';

const router = Router({ mergeParams: true });

const generateQuizSchema = z.object({
  classId: z.string().min(1),
  topic: z.string().min(2).max(300),
  notes: z.string().max(6000).optional(),
  count: z.number().int().min(1).max(10).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

router.post(
  '/ai-teacher/generate-quiz',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const data = generateQuizSchema.parse(req.body);
    const result = await teacherGenerateQuiz({
      tenantId: req.tenant!.id,
      teacherId: req.user!.sub,
      ...data,
    });
    res.json(result);
  })
);

const feedbackSchema = z.object({
  classId: z.string().min(1),
  studentName: z.string().min(1).max(100),
  assignmentTitle: z.string().min(1).max(200),
  submissionText: z.string().min(10).max(8000),
  maxMarks: z.number().optional(),
});

router.post(
  '/ai-teacher/draft-feedback',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const data = feedbackSchema.parse(req.body);
    const result = await teacherDraftFeedback({
      tenantId: req.tenant!.id,
      teacherId: req.user!.sub,
      ...data,
    });
    res.json(result);
  })
);

router.get(
  '/ai-teacher/weak-topics/:classId',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const result = await teacherWeakTopicSummary({
      tenantId: req.tenant!.id,
      teacherId: req.user!.sub,
      classId: req.params.classId,
    });
    res.json(result);
  })
);

router.get(
  '/ai-teacher/intervention-suggestions/:classId',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const result = await teacherInterventionSuggestions({
      tenantId: req.tenant!.id,
      teacherId: req.user!.sub,
      classId: req.params.classId,
    });
    res.json(result);
  })
);

const historyQuerySchema = z.object({
  classId: z.string().min(1),
  tool: z.enum(['quiz-gen', 'feedback', 'weak-topics', 'intervention']),
});

router.get(
  '/ai-teacher/history',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const { classId, tool } = historyQuerySchema.parse({
      classId: req.query.classId,
      tool: req.query.tool,
    });
    const history = await listTeacherAiHistory({
      tenantId: req.tenant!.id,
      teacherId: req.user!.sub,
      classId,
      tool: tool as TeacherAiToolId,
    });
    res.json({ history });
  })
);

export default router;
