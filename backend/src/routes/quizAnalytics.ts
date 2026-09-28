import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getClassesAnalytics,
  getQuizReportData,
  getQuizzesAnalytics,
  getStudentMastery,
  getStudentsAnalytics,
} from '../services/quizAnalytics';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

router.get(
  '/quiz-analytics/classes',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';
    const data = await getClassesAnalytics({
      teacherId: req.user!.sub,
      isAdmin,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/quizzes',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const data = await getQuizzesAnalytics({
      classId,
      teacherId: req.user!.sub,
      isAdmin,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/students',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const data = await getStudentsAnalytics({
      classId,
      teacherId: req.user!.sub,
      isAdmin,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/quizzes/:quizId/report',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: { class: { select: { teacherId: true } } },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) {
      throw forbidden('Not allowed');
    }
    const report = await getQuizReportData(quiz.id);
    res.json({ report });
  })
);

/** Student (or staff viewing student) mastery across quizzes. */
router.get(
  '/quiz-analytics/my-mastery',
  authenticate,
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const studentId =
      typeof req.query.studentId === 'string' &&
      (req.user!.role === 'teacher' || req.user!.role === 'admin' || req.user!.role === 'superadmin')
        ? req.query.studentId
        : req.user!.sub;

    if (studentId !== req.user!.sub && req.user!.role === 'student') {
      throw forbidden('Not allowed');
    }

    const data = await getStudentMastery({ studentId, classId });
    res.json(data);
  })
);

export default router;
