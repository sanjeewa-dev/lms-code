import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

async function assertCanViewGradebook(req: any, classId: string) {
  const klass = await prisma.class.findFirst({ where: { id: classId } });
  if (!klass) throw notFound('Class not found');
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return klass;
  if (req.user.role === 'teacher' && klass.teacherId === req.user.sub) return klass;
  throw forbidden('Not allowed to view this gradebook');
}

router.get(
  '/classes/:classId/gradebook',
  authenticate,
  requireRole('admin', 'teacher'),
  asyncHandler(async (req, res) => {
    const klass = await assertCanViewGradebook(req, req.params.classId);

    const [enrollments, assessments, quizzes] = await Promise.all([
      prisma.enrollment.findMany({
        where: { classId: klass.id, status: 'active' },
        include: { student: { select: { id: true, name: true, email: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      prisma.material.findMany({
        where: { classId: klass.id, kind: 'assessment' },
        select: { id: true, title: true, maxMarks: true, dueDate: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.quiz.findMany({
        where: { classId: klass.id },
        select: { id: true, title: true, totalMarks: true, isPublished: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const studentIds = enrollments.map((e) => e.student.id);

    const [submissions, attempts] = await Promise.all([
      prisma.submission.findMany({
        where: {
          classId: klass.id,
          studentId: { in: studentIds },
          assessmentId: { in: assessments.map((a) => a.id) },
        },
        select: { studentId: true, assessmentId: true, grade: true, submittedAt: true },
      }),
      prisma.quizAttempt.findMany({
        where: {
          quizId: { in: quizzes.map((q) => q.id) },
          studentId: { in: studentIds },
          submittedAt: { not: null },
        },
        select: { studentId: true, quizId: true, score: true, submittedAt: true },
      }),
    ]);

    const rows = enrollments.map((e) => {
      const assignmentScores = assessments.map((a) => {
        const sub = submissions.find((s) => s.studentId === e.student.id && s.assessmentId === a.id);
        return {
          assessmentId: a.id,
          grade: sub?.grade ?? null,
          maxMarks: a.maxMarks,
          submitted: Boolean(sub),
        };
      });
      const quizScores = quizzes.map((q) => {
        const att = attempts.find((x) => x.studentId === e.student.id && x.quizId === q.id);
        return {
          quizId: q.id,
          score: att?.score ?? null,
          totalMarks: q.totalMarks,
          submitted: Boolean(att),
        };
      });

      let earned = 0;
      let possible = 0;
      for (const a of assignmentScores) {
        if (a.maxMarks != null && a.maxMarks > 0 && a.grade != null) {
          earned += a.grade;
          possible += a.maxMarks;
        }
      }
      for (const q of quizScores) {
        if (q.totalMarks > 0 && q.score != null) {
          earned += q.score;
          possible += q.totalMarks;
        }
      }

      return {
        student: e.student,
        assignments: assignmentScores,
        quizzes: quizScores,
        totalEarned: earned,
        totalPossible: possible,
        percent: possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null,
      };
    });

    res.json({
      class: { id: klass.id, title: klass.title },
      assessments,
      quizzes,
      rows,
    });
  })
);

/** Student view of own grades in a class */
router.get(
  '/classes/:classId/gradebook/mine',
  authenticate,
  requireRole('student'),
  requireActiveEnrollment('classId'),
  asyncHandler(async (req, res) => {
    const classId = req.params.classId;
    const studentId = req.user!.sub;

    const [assessments, quizzes, submissions, attempts] = await Promise.all([
      prisma.material.findMany({
        where: { classId, kind: 'assessment' },
        select: { id: true, title: true, maxMarks: true, dueDate: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.quiz.findMany({
        where: { classId, isPublished: true },
        select: { id: true, title: true, totalMarks: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.submission.findMany({
        where: { classId, studentId },
        select: { assessmentId: true, grade: true, feedback: true, submittedAt: true },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId, submittedAt: { not: null }, quiz: { classId } },
        select: { quizId: true, score: true, submittedAt: true },
      }),
    ]);

    res.json({
      assignments: assessments.map((a) => {
        const sub = submissions.find((s) => s.assessmentId === a.id);
        return {
          id: a.id,
          title: a.title,
          maxMarks: a.maxMarks,
          grade: sub?.grade ?? null,
          feedback: sub?.feedback ?? null,
          submittedAt: sub?.submittedAt ?? null,
        };
      }),
      quizzes: quizzes.map((q) => {
        const att = attempts.find((x) => x.quizId === q.id);
        return {
          id: q.id,
          title: q.title,
          totalMarks: q.totalMarks,
          score: att?.score ?? null,
          submittedAt: att?.submittedAt ?? null,
        };
      }),
    });
  })
);

export default router;
