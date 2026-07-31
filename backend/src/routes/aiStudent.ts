import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listAiClasses,
  getAiQuota,
  aiTutorChat,
  aiSummarize,
  aiGenerateMcq,
  aiFlashcards,
  aiStudyPlan,
  listAiToolHistory,
  type AiToolId,
} from '../services/aiStudent';

const router = Router({ mergeParams: true });

const toolIds = ['tutor', 'summarizer', 'mcq', 'flashcards', 'study-plan'] as const;

router.get(
  '/ai/classes',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const classes = await listAiClasses(req.user!.sub);
    res.json({ classes });
  })
);

router.get(
  '/ai/quota',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    if (!classId) return res.status(400).json({ error: 'classId is required' });
    const quota = await getAiQuota({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId,
    });
    res.json({ quota });
  })
);

router.get(
  '/ai/history',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const tool = typeof req.query.tool === 'string' ? req.query.tool : '';
    if (!classId) return res.status(400).json({ error: 'classId is required' });
    if (!toolIds.includes(tool as AiToolId)) {
      return res.status(400).json({ error: 'tool is required' });
    }
    const history = await listAiToolHistory({
      studentId: req.user!.sub,
      classId,
      tool: tool as AiToolId,
    });
    res.json({ history });
  })
);

const tutorSchema = z.object({
  classId: z.string().min(1),
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional(),
});

router.post(
  '/ai/tutor',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = tutorSchema.parse(req.body);
    const result = await aiTutorChat({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: data.classId,
      message: data.message,
      history: data.history,
    });
    res.json(result);
  })
);

const summarizeSchema = z.object({
  classId: z.string().min(1),
  notes: z.string().min(40).max(12000),
});

router.post(
  '/ai/summarize',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = summarizeSchema.parse(req.body);
    const result = await aiSummarize({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: data.classId,
      notes: data.notes,
    });
    res.json(result);
  })
);

const mcqSchema = z.object({
  classId: z.string().min(1),
  topic: z.string().max(200).optional(),
});

router.post(
  '/ai/mcq',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = mcqSchema.parse(req.body);
    const result = await aiGenerateMcq({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: data.classId,
      topic: data.topic,
    });
    res.json(result);
  })
);

const flashSchema = z.object({
  classId: z.string().min(1),
  topicOrNotes: z.string().min(8).max(8000),
});

router.post(
  '/ai/flashcards',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = flashSchema.parse(req.body);
    const result = await aiFlashcards({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: data.classId,
      topicOrNotes: data.topicOrNotes,
    });
    res.json(result);
  })
);

const planSchema = z.object({
  classId: z.string().min(1),
  subject: z.string().min(2).max(120),
  unit: z.string().min(1).max(120),
  topic: z.string().min(2).max(200),
});

router.post(
  '/ai/study-plan',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const data = planSchema.parse(req.body);
    const result = await aiStudyPlan({
      tenantId: req.tenant!.id,
      studentId: req.user!.sub,
      classId: data.classId,
      subject: data.subject,
      unit: data.unit,
      topic: data.topic,
    });
    res.json(result);
  })
);

export default router;
