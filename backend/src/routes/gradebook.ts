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
        where: { classId: klass.id, isPublished: true },
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

/** Student dashboard: quiz + assignment marks as % across enrolled classes (chronological). */
router.get(
  '/performance/mine',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;

    const [attempts, gradedSubs] = await Promise.all([
      prisma.quizAttempt.findMany({
        where: {
          studentId,
          submittedAt: { not: null },
          quiz: { isPublished: true },
        },
        include: {
          quiz: { select: { title: true, totalMarks: true, class: { select: { title: true } } } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 24,
      }),
      prisma.submission.findMany({
        where: {
          studentId,
          grade: { not: null },
          assessmentId: { not: null },
          assessment: { kind: 'assessment' },
        },
        include: {
          assessment: {
            select: {
              title: true,
              maxMarks: true,
              class: { select: { title: true } },
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
        take: 24,
      }),
    ]);

    type Point = {
      label: string;
      classTitle: string;
      score: number;
      totalMarks: number;
      percentage: number;
      submittedAt: string;
      kind: 'quiz' | 'assignment';
    };

    const quizPoints: Point[] = attempts.map((a) => {
      const total = a.quiz.totalMarks || 0;
      const score = a.score == null ? 0 : Number(a.score);
      const percentage = total > 0 ? Math.max(0, Math.min(100, Math.round((score / total) * 100))) : 0;
      return {
        label: a.quiz.title,
        classTitle: a.quiz.class.title,
        score,
        totalMarks: total,
        percentage,
        submittedAt: a.submittedAt!.toISOString(),
        kind: 'quiz',
      };
    });

    const assignmentPoints: Point[] = gradedSubs
      .filter((s) => s.assessment && s.assessment.maxMarks != null && s.assessment.maxMarks > 0)
      .map((s) => {
        const total = Number(s.assessment!.maxMarks);
        const score = Number(s.grade);
        const percentage = Math.max(0, Math.min(100, Math.round((score / total) * 100)));
        return {
          label: s.assessment!.title,
          classTitle: s.assessment!.class.title,
          score,
          totalMarks: total,
          percentage,
          submittedAt: s.submittedAt.toISOString(),
          kind: 'assignment' as const,
        };
      });

    const points = [...quizPoints, ...assignmentPoints]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(-24);

    res.json({ points });
  })
);

export default router;
