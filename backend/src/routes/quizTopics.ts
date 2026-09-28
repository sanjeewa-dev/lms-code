import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import { quizTopicSchema } from '../validation/schemas';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

async function assertClassOwner(req: any, classId: string) {
  const klass = await prisma.class.findFirst({ where: { id: classId } });
  if (!klass) throw notFound('Class not found');
  if (req.user.role === 'teacher' && klass.teacherId !== req.user.sub) {
    throw forbidden('You can only manage topics for your own classes');
  }
  return klass;
}

/** List quiz topics linked to a class (and create defaults if empty). */
router.get(
  '/classes/:classId/quiz-topics',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertClassOwner(req, req.params.classId);
    const topics = await prisma.quizTopic.findMany({
      where: { classes: { some: { classId: req.params.classId } } },
      orderBy: { name: 'asc' },
    });
    res.json({ topics });
  })
);

/** List all tenant quiz topics (for bank / cross-class). */
router.get(
  '/quiz-topics',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const topics = await prisma.quizTopic.findMany({
      orderBy: { name: 'asc' },
      include: { classes: { select: { classId: true } } },
    });
    res.json({ topics });
  })
);

router.post(
  '/classes/:classId/quiz-topics',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertClassOwner(req, req.params.classId);
    const data = quizTopicSchema.parse(req.body);
    const name = data.name.trim();
    const tenantId = req.tenant!.id;

    let topic = await prisma.quizTopic.findFirst({
      where: { tenantId, name },
    });
    if (!topic) {
      topic = await prisma.quizTopic.create({
        data: {
          tenantId,
          name,
          createdById: req.user!.sub,
        },
      });
    }

    const existingLink = await prisma.quizTopicClass.findFirst({
      where: { quizTopicId: topic.id, classId: req.params.classId },
    });
    if (existingLink) throw conflict('Topic already linked to this class');

    await prisma.quizTopicClass.create({
      data: { quizTopicId: topic.id, classId: req.params.classId },
    });

    res.status(201).json({ topic });
  })
);

router.delete(
  '/classes/:classId/quiz-topics/:topicId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertClassOwner(req, req.params.classId);
    const link = await prisma.quizTopicClass.findFirst({
      where: { quizTopicId: req.params.topicId, classId: req.params.classId },
    });
    if (!link) throw notFound('Topic link not found');
    await prisma.quizTopicClass.delete({
      where: {
        quizTopicId_classId: {
          quizTopicId: req.params.topicId,
          classId: req.params.classId,
        },
      },
    });
    res.status(204).send();
  })
);

router.patch(
  '/quiz-topics/:topicId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = quizTopicSchema.parse(req.body);
    const topic = await prisma.quizTopic.findFirst({ where: { id: req.params.topicId } });
    if (!topic) throw notFound('Topic not found');
    const name = data.name.trim();
    if (!name) throw badRequest('Name required');
    const updated = await prisma.quizTopic.update({
      where: { id: topic.id },
      data: { name },
    });
    res.json({ topic: updated });
  })
);

export default router;
