import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, requireRole, requireActiveEnrollment } from '../middleware/auth';
import { quizSchema, quizUpdateSchema, submitAttemptSchema } from '../validation/schemas';
import { gradeAttempt, isAttemptExpired } from '../services/quiz';
import { studentHasContentAccess } from '../services/access';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError';

const router = Router({ mergeParams: true });

async function assertClassOwner(req: any, classId: string) {
  const klass = await prisma.class.findFirst({ where: { id: classId } });
  if (!klass) throw notFound('Class not found');
  if (req.user.role === 'teacher' && klass.teacherId !== req.user.sub) {
    throw forbidden('You can only manage quizzes for your own classes');
  }
  return klass;
}

router.post(
  '/classes/:classId/quizzes',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    await assertClassOwner(req, req.params.classId);
    const data = quizSchema.parse(req.body);
    const totalMarks = data.questions.reduce((sum, q) => sum + q.marks, 0);
    const tenantId = req.tenant!.id;

    const quiz = await prisma.quiz.create({
      data: {
        tenantId,
        classId: req.params.classId,
        title: data.title,
        description: data.description ?? '',
        timeLimitSec: data.timeLimitSec,
        totalMarks,
        availableFrom: data.availableFrom,
        availableTo: data.availableTo,
        isPublished: data.isPublished ?? false,
        questions: {
          create: data.questions.map((q, index) => ({
            tenantId,
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            marks: q.marks,
            order: index,
          })),
        },
      },
      include: { _count: { select: { questions: true } } },
    });

    res.status(201).json({ quiz });
  })
);

router.get(
  '/classes/:classId/quizzes',
  authenticate,
  requireActiveEnrollment('classId'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const klass = await prisma.class.findFirst({ where: { id: req.params.classId } });
    const isOwner = klass?.teacherId === user.sub;
    const isStaff = user.role === 'admin' || user.role === 'superadmin';

    const where: any = { classId: req.params.classId };
    if (!isStaff && !isOwner) where.isPublished = true;

    const quizzes = await prisma.quiz.findMany({
      where,
      include: {
        _count: { select: { questions: true } },
        attempts:
          user.role === 'student'
            ? { where: { studentId: user.sub, submittedAt: { not: null } }, take: 1 }
            : false,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      quizzes: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        timeLimitSec: q.timeLimitSec,
        totalMarks: q.totalMarks,
        questionCount: q._count.questions,
        isPublished: q.isPublished,
        availableFrom: q.availableFrom,
        availableTo: q.availableTo,
        myAttempt:
          Array.isArray((q as any).attempts) && (q as any).attempts[0]?.submittedAt
            ? {
                id: (q as any).attempts[0].id,
                submittedAt: (q as any).attempts[0].submittedAt,
                score: (q as any).attempts[0].score,
              }
            : null,
      })),
    });
  })
);

router.get(
  '/quizzes/:quizId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        class: { select: { teacherId: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) throw forbidden('Not allowed');
    res.json({
      quiz: {
        ...quiz,
        attemptCount: quiz._count.attempts,
      },
    });
  })
);

router.patch(
  '/quizzes/:quizId/publish',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: { class: { select: { teacherId: true } } },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) throw forbidden('Not allowed');
    const updated = await prisma.quiz.update({
      where: { id: quiz.id },
      data: { isPublished: Boolean(req.body?.isPublished) },
    });
    res.json({ quiz: { id: updated.id, isPublished: updated.isPublished } });
  })
);

router.patch(
  '/quizzes/:quizId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: {
        class: { select: { teacherId: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) {
      throw forbidden('You can only edit quizzes for your own classes');
    }

    const data = quizUpdateSchema.parse(req.body);
    if (
      data.title === undefined &&
      data.description === undefined &&
      data.timeLimitSec === undefined &&
      data.availableFrom === undefined &&
      data.availableTo === undefined &&
      data.isPublished === undefined &&
      data.questions === undefined
    ) {
      throw badRequest('No fields to update');
    }

    if (data.questions && quiz._count.attempts > 0) {
      throw badRequest(
        'Cannot change questions after students have started this quiz. Create a new quiz instead.'
      );
    }

    const tenantId = req.tenant!.id;
    const updateData: {
      title?: string;
      description?: string;
      timeLimitSec?: number;
      availableFrom?: Date | null;
      availableTo?: Date | null;
      isPublished?: boolean;
      totalMarks?: number;
    } = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.timeLimitSec !== undefined) updateData.timeLimitSec = data.timeLimitSec;
    if (data.availableFrom !== undefined) updateData.availableFrom = data.availableFrom;
    if (data.availableTo !== undefined) updateData.availableTo = data.availableTo;
    if (data.isPublished !== undefined) updateData.isPublished = data.isPublished;

    if (data.questions) {
      updateData.totalMarks = data.questions.reduce((sum, q) => sum + q.marks, 0);
      await prisma.$transaction([
        prisma.question.deleteMany({ where: { quizId: quiz.id } }),
        prisma.quiz.update({
          where: { id: quiz.id },
          data: {
            ...updateData,
            questions: {
              create: data.questions.map((q, index) => ({
                tenantId,
                text: q.text,
                options: q.options,
                correctIndex: q.correctIndex,
                marks: q.marks,
                order: index,
              })),
            },
          },
          include: { _count: { select: { questions: true } } },
        }),
      ]);
    } else {
      await prisma.quiz.update({
        where: { id: quiz.id },
        data: updateData,
      });
    }

    const updated = await prisma.quiz.findFirst({
      where: { id: quiz.id },
      include: { _count: { select: { questions: true } }, questions: { orderBy: { order: 'asc' } } },
    });
    res.json({ quiz: updated });
  })
);

router.delete(
  '/quizzes/:quizId',
  authenticate,
  requireRole('teacher', 'admin'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: { class: { select: { teacherId: true } } },
    });
    if (!quiz) throw notFound('Quiz not found');
    if (req.user!.role === 'teacher' && quiz.class.teacherId !== req.user!.sub) {
      throw forbidden('You can only delete quizzes for your own classes');
    }

    await prisma.quiz.delete({ where: { id: quiz.id } });
    res.status(204).send();
  })
);

router.post(
  '/quizzes/:quizId/attempts',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz || !quiz.isPublished) throw notFound('Quiz not found');

    const enrollment = await prisma.enrollment.findFirst({
      where: { classId: quiz.classId, studentId: req.user!.sub },
    });
    if (!enrollment || enrollment.status !== 'active') {
      throw forbidden('You must have an approved enrollment to take this quiz');
    }

    const access = await studentHasContentAccess({
      tenantId: req.tenant!.id,
      classId: quiz.classId,
      studentId: req.user!.sub,
    });
    if (!access.ok) throw forbidden(access.reason ?? 'Access denied');

    const now = new Date();
    if (quiz.availableFrom && now < quiz.availableFrom) throw badRequest('Quiz is not open yet');
    if (quiz.availableTo && now > quiz.availableTo) throw badRequest('Quiz is closed');

    const existing = await prisma.quizAttempt.findFirst({
      where: { quizId: quiz.id, studentId: req.user!.sub },
    });
    if (existing?.submittedAt) throw conflict('You have already completed this quiz');

    let attempt = existing;
    if (!attempt) {
      try {
        attempt = await prisma.quizAttempt.create({
          data: { tenantId: req.tenant!.id, quizId: quiz.id, studentId: req.user!.sub },
        });
      } catch (err) {
        // Concurrent "Start" (e.g. React Strict Mode double-mount) can race the unique
        // (quizId, studentId) constraint — recover by loading the winner.
        const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: string }).code : undefined;
        if (code !== 'P2002') throw err;
        attempt = await prisma.quizAttempt.findFirst({
          where: { quizId: quiz.id, studentId: req.user!.sub },
        });
        if (!attempt) throw err;
        if (attempt.submittedAt) throw conflict('You have already completed this quiz');
      }
    }

    res.status(201).json({
      attempt: { id: attempt.id, startedAt: attempt.startedAt },
      quiz: {
        id: quiz.id,
        title: quiz.title,
        timeLimitSec: quiz.timeLimitSec,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options,
          marks: q.marks,
        })),
      },
    });
  })
);

router.post(
  '/attempts/:attemptId/submit',
  authenticate,
  requireRole('student'),
  asyncHandler(async (req, res) => {
    const attempt = await prisma.quizAttempt.findFirst({
      where: { id: req.params.attemptId },
      include: { quiz: { include: { questions: true } } },
    });
    if (!attempt) throw notFound('Attempt not found');
    if (attempt.studentId !== req.user!.sub) throw forbidden('Not your attempt');
    if (attempt.submittedAt) throw conflict('This attempt is already submitted');

    const data = submitAttemptSchema.parse(req.body);
    if (isAttemptExpired(attempt.startedAt, attempt.quiz.timeLimitSec)) {
      throw badRequest('Time limit exceeded. This attempt can no longer be submitted.');
    }

    const result = gradeAttempt(attempt.quiz.questions, data.answers);

    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { attemptId: attempt.id } }),
      prisma.answer.createMany({
        data: result.gradedAnswers.map((a) => ({
          tenantId: req.tenant!.id,
          attemptId: attempt.id,
          questionId: a.questionId,
          selectedIndex: a.selectedIndex,
        })),
      }),
      prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { submittedAt: new Date(), score: result.score },
      }),
    ]);

    res.json({
      result: {
        score: result.score,
        totalMarks: result.totalMarks,
        correctCount: result.correctCount,
        questionCount: attempt.quiz.questions.length,
      },
    });
  })
);

router.get(
  '/attempts/:attemptId/result',
  authenticate,
  asyncHandler(async (req, res) => {
    const attempt = await prisma.quizAttempt.findFirst({
      where: { id: req.params.attemptId },
      include: {
        answers: true,
        quiz: {
          include: { questions: { orderBy: { order: 'asc' } }, class: { select: { teacherId: true } } },
        },
      },
    });
    if (!attempt) throw notFound('Attempt not found');

    const user = req.user!;
    const canView =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      attempt.studentId === user.sub ||
      attempt.quiz.class.teacherId === user.sub;
    if (!canView) throw forbidden('Not allowed');
    if (!attempt.submittedAt) throw badRequest('Attempt not submitted yet');

    const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

    res.json({
      result: {
        score: attempt.score,
        totalMarks: attempt.quiz.totalMarks,
        submittedAt: attempt.submittedAt,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        classId: attempt.quiz.classId,
        questions: attempt.quiz.questions.map((q) => {
          const ans = answerMap.get(q.id);
          const steps = ans?.explanationSteps;
          return {
            id: q.id,
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            selectedIndex: ans?.selectedIndex ?? -1,
            marks: q.marks,
            explanation: ans?.explanation ?? null,
            explanationSteps: Array.isArray(steps) ? (steps as string[]) : null,
          };
        }),
      },
    });
  })
);

// Ranked MCQ results / leaderboard for a quiz.
// Teachers/admins see full results; enrolled students see the board and their place.
router.get(
  '/quizzes/:quizId/leaderboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.quizId },
      include: { class: { select: { id: true, teacherId: true } } },
    });
    if (!quiz) throw notFound('Quiz not found');

    const user = req.user!;
    const isStaff =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      (user.role === 'teacher' && quiz.class.teacherId === user.sub);

    if (!isStaff) {
      if (user.role !== 'student') throw forbidden('Not allowed');
      if (!quiz.isPublished) throw notFound('Quiz not found');
      const enrollment = await prisma.enrollment.findFirst({
        where: { classId: quiz.classId, studentId: user.sub, status: 'active' },
      });
      if (!enrollment) throw forbidden('You must be enrolled in this class to view results');

      // Students may only see the leaderboard after they finish the quiz.
      const myAttempt = await prisma.quizAttempt.findFirst({
        where: { quizId: quiz.id, studentId: user.sub, submittedAt: { not: null } },
      });
      if (!myAttempt) {
        throw forbidden('Finish the quiz first to unlock the leaderboard');
      }
    }

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, submittedAt: { not: null } },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
    });

    const totalMarks = Number(quiz.totalMarks);
    const entries = attempts.map((a, index) => {
      const score = a.score == null ? 0 : Number(a.score);
      const pct = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
      return {
        rank: index + 1,
        attemptId: a.id,
        studentId: a.student.id,
        studentName: a.student.name,
        studentEmail: isStaff ? a.student.email : undefined,
        score,
        totalMarks,
        percentage: pct,
        submittedAt: a.submittedAt,
        isMe: a.studentId === user.sub,
      };
    });

    const myEntry = entries.find((e) => e.isMe) ?? null;

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        totalMarks,
        attemptCount: entries.length,
      },
      leaderboard: entries,
      myPlace: myEntry
        ? {
            rank: myEntry.rank,
            score: myEntry.score,
            totalMarks: myEntry.totalMarks,
            percentage: myEntry.percentage,
            attemptId: myEntry.attemptId,
          }
        : null,
    });
  })
);

export default router;
