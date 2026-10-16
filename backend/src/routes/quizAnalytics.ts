import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getAnalyticsDashboard,
  getClassesAnalytics,
  getClassOverview,
  getCohortLeaderboard,
  getCohortOverview,
  getCohortScoreDistribution,
  getQuizDetail,
  getQuizReportData,
  getQuizzesAnalytics,
  getStudentDetail,
  getStudentMastery,
  getStudentProgress,
  getStudentsAnalytics,
  getStudentsEngagement,
  getTrendSeries,
} from '../services/quizAnalytics';
import { prisma } from '../lib/prisma';
import { TtlCache } from '../lib/ttlCache';
import { forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

const dashboardCache = new TtlCache<unknown>(10_000);

function staffScope(req: { user?: { sub: string; role: string } }) {
  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'superadmin';
  return { teacherId: req.user!.sub, isAdmin };
}

async function assertQuizAccess(quizId: string, user: { sub: string; role: string }) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId },
    include: { class: { select: { teacherId: true } } },
  });
  if (!quiz) throw notFound('Quiz not found');
  if (user.role === 'teacher' && quiz.class.teacherId !== user.sub) {
    throw forbidden('Not allowed');
  }
  return quiz;
}

router.get(
  '/quiz-analytics',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const scope = staffScope(req);
    const cacheKey = `${req.tenant!.id}:${scope.teacherId}:${scope.isAdmin}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const data = await getAnalyticsDashboard(scope);
    dashboardCache.set(cacheKey, data);
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/classes',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getClassesAnalytics(staffScope(req));
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/quizzes',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const data = await getQuizzesAnalytics({ ...staffScope(req), classId });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/students',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const data = await getStudentsAnalytics({ ...staffScope(req), classId });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/trends',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getTrendSeries({
      ...staffScope(req),
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
      quizId:
        typeof req.query.quizId === 'string'
          ? req.query.quizId
          : typeof req.query.assessmentId === 'string'
            ? req.query.assessmentId
            : undefined,
      studentId: typeof req.query.studentId === 'string' ? req.query.studentId : undefined,
      topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/class-overview',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    if (!classId) throw notFound('classId required');
    const data = await getClassOverview({ ...staffScope(req), classId });
    if (!data) throw notFound('Class not found');
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/students-engagement',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 100;
    const data = await getStudentsEngagement({
      ...staffScope(req),
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 100,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/leaderboard',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getCohortLeaderboard({
      ...staffScope(req),
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
      quizId:
        typeof req.query.quizId === 'string'
          ? req.query.quizId
          : typeof req.query.assessmentId === 'string'
            ? req.query.assessmentId
            : undefined,
      size: req.query.size ? Number(req.query.size) : 5,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/score-distribution',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getCohortScoreDistribution({
      ...staffScope(req),
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
      quizId:
        typeof req.query.quizId === 'string'
          ? req.query.quizId
          : typeof req.query.assessmentId === 'string'
            ? req.query.assessmentId
            : undefined,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/cohort-overview',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getCohortOverview({
      ...staffScope(req),
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
    });
    res.json(data);
  })
);

router.get(
  '/quiz-analytics/quizzes/:quizId/detail',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertQuizAccess(req.params.quizId, req.user!);
    const detail = await getQuizDetail(req.params.quizId);
    if (!detail) throw notFound('Quiz not found');
    res.json({ detail });
  })
);

router.get(
  '/quiz-analytics/quizzes/:quizId/report',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertQuizAccess(req.params.quizId, req.user!);
    const report = await getQuizReportData(req.params.quizId);
    res.json({ report });
  })
);

router.get(
  '/quiz-analytics/student/:studentId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const data = await getStudentDetail({
      ...staffScope(req),
      studentId: req.params.studentId,
      classId: typeof req.query.classId === 'string' ? req.query.classId : undefined,
    });
    if (!data) throw notFound('Student not found');
    res.json(data);
  })
);

function resolveAnalyticsStudentId(req: {
  user?: { sub: string; role: string };
  query: { studentId?: unknown };
}): string {
  const studentId =
    typeof req.query.studentId === 'string' &&
    (req.user!.role === 'teacher' || req.user!.role === 'admin' || req.user!.role === 'superadmin')
      ? req.query.studentId
      : req.user!.sub;

  if (studentId !== req.user!.sub && req.user!.role === 'student') {
    throw forbidden('Not allowed');
  }
  return studentId;
}

/** Student (or staff viewing student) mastery across quizzes. */
router.get(
  '/quiz-analytics/my-mastery',
  authenticate,
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const studentId = resolveAnalyticsStudentId(req);
    const data = await getStudentMastery({ studentId, classId });
    res.json(data);
  })
);

/** Actionable progress: focus topics, anonymous cohort, next steps. */
router.get(
  '/quiz-analytics/my-progress',
  authenticate,
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const studentId = resolveAnalyticsStudentId(req);
    const data = await getStudentProgress({ studentId, classId });
    res.json(data);
  })
);

export default router;
