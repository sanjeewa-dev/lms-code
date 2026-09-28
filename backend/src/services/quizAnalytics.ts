import { prisma } from '../lib/prisma';

type TopicStat = { correct: number; total: number; percentage: number };

function mergeTopicBreakdown(
  into: Record<string, { correct: number; total: number }>,
  breakdown: unknown
) {
  if (!breakdown || typeof breakdown !== 'object') return;
  for (const [topic, raw] of Object.entries(breakdown as Record<string, TopicStat>)) {
    if (!raw || typeof raw !== 'object') continue;
    if (!into[topic]) into[topic] = { correct: 0, total: 0 };
    into[topic].correct += Number(raw.correct) || 0;
    into[topic].total += Number(raw.total) || 0;
  }
}

function finalizeTopics(map: Record<string, { correct: number; total: number }>) {
  return Object.entries(map)
    .map(([topic, v]) => ({
      topic,
      correct: v.correct,
      total: v.total,
      percentage: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.percentage - b.percentage);
}

export async function getClassesAnalytics(params: {
  teacherId?: string;
  isAdmin: boolean;
}) {
  const classes = await prisma.class.findMany({
    where: params.isAdmin ? undefined : { teacherId: params.teacherId },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  const results = [];
  for (const klass of classes) {
    const attempts = await prisma.quizAttempt.findMany({
      where: {
        submittedAt: { not: null },
        quiz: { classId: klass.id },
      },
      select: { score: true, topicBreakdown: true, quiz: { select: { totalMarks: true } } },
    });
    const topicMap: Record<string, { correct: number; total: number }> = {};
    let scoreSum = 0;
    let marksSum = 0;
    for (const a of attempts) {
      mergeTopicBreakdown(topicMap, a.topicBreakdown);
      scoreSum += a.score ?? 0;
      marksSum += a.quiz.totalMarks || 0;
    }
    results.push({
      classId: klass.id,
      classTitle: klass.title,
      attemptCount: attempts.length,
      averagePercentage:
        marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      topicMastery: finalizeTopics(topicMap),
    });
  }
  return { classes: results };
}

export async function getQuizzesAnalytics(params: {
  classId?: string;
  teacherId?: string;
  isAdmin: boolean;
}) {
  const quizzes = await prisma.quiz.findMany({
    where: {
      ...(params.classId ? { classId: params.classId } : {}),
      ...(params.isAdmin ? {} : { class: { teacherId: params.teacherId } }),
    },
    include: {
      class: { select: { id: true, title: true } },
      _count: { select: { questions: true, attempts: true } },
      attempts: {
        where: { submittedAt: { not: null } },
        select: { score: true, topicBreakdown: true, questionScores: true, studentId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return {
    quizzes: quizzes.map((quiz) => {
      const topicMap: Record<string, { correct: number; total: number }> = {};
      let scoreSum = 0;
      const questionPerf = new Map<
        string,
        { correct: number; total: number; topic: string }
      >();
      for (const a of quiz.attempts) {
        mergeTopicBreakdown(topicMap, a.topicBreakdown);
        scoreSum += a.score ?? 0;
        const scores = Array.isArray(a.questionScores) ? (a.questionScores as any[]) : [];
        for (const row of scores) {
          if (!row?.questionId) continue;
          const cur = questionPerf.get(row.questionId) ?? {
            correct: 0,
            total: 0,
            topic: row.topic || 'General',
          };
          cur.total += 1;
          if (row.correct) cur.correct += 1;
          questionPerf.set(row.questionId, cur);
        }
      }
      const submitted = quiz.attempts.length;
      return {
        quizId: quiz.id,
        title: quiz.title,
        classId: quiz.class.id,
        classTitle: quiz.class.title,
        questionCount: quiz._count.questions,
        attemptCount: submitted,
        averagePercentage:
          submitted > 0 && quiz.totalMarks > 0
            ? Math.round((scoreSum / (submitted * quiz.totalMarks)) * 1000) / 10
            : null,
        topicMastery: finalizeTopics(topicMap),
        questionPerformance: [...questionPerf.entries()].map(([questionId, v]) => ({
          questionId,
          topic: v.topic,
          correct: v.correct,
          total: v.total,
          percentage: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
        })),
      };
    }),
  };
}

export async function getStudentsAnalytics(params: {
  classId?: string;
  teacherId?: string;
  isAdmin: boolean;
}) {
  const classFilter = params.classId
    ? { id: params.classId }
    : params.isAdmin
      ? undefined
      : { teacherId: params.teacherId };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: 'active',
      ...(classFilter ? { class: classFilter } : {}),
    },
    select: {
      classId: true,
      class: { select: { id: true, title: true } },
      student: { select: { id: true, name: true, email: true } },
    },
    take: 500,
  });

  const studentIds = [...new Set(enrollments.map((e) => e.student.id))];
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      studentId: { in: studentIds },
      submittedAt: { not: null },
      ...(params.classId ? { quiz: { classId: params.classId } } : {}),
      ...(params.isAdmin ? {} : { quiz: { class: { teacherId: params.teacherId } } }),
    },
    select: {
      studentId: true,
      score: true,
      topicBreakdown: true,
      quiz: { select: { totalMarks: true, title: true, id: true, classId: true } },
    },
  });

  const byStudent = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = byStudent.get(a.studentId) ?? [];
    list.push(a);
    byStudent.set(a.studentId, list);
  }

  const seen = new Set<string>();
  const students = [];
  for (const e of enrollments) {
    if (seen.has(e.student.id)) continue;
    seen.add(e.student.id);
    const studentAttempts = byStudent.get(e.student.id) ?? [];
    const topicMap: Record<string, { correct: number; total: number }> = {};
    let scoreSum = 0;
    let marksSum = 0;
    for (const a of studentAttempts) {
      mergeTopicBreakdown(topicMap, a.topicBreakdown);
      scoreSum += a.score ?? 0;
      marksSum += a.quiz.totalMarks || 0;
    }
    const topicMastery = finalizeTopics(topicMap);
    students.push({
      studentId: e.student.id,
      name: e.student.name,
      email: e.student.email,
      attemptCount: studentAttempts.length,
      averagePercentage:
        marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      topicMastery,
      strengths: topicMastery.filter((t) => t.percentage >= 70).slice(-3).reverse(),
      weaknesses: topicMastery.slice(0, 3),
    });
  }

  return { students };
}

export async function getStudentMastery(params: {
  studentId: string;
  classId?: string;
}) {
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      studentId: params.studentId,
      submittedAt: { not: null },
      ...(params.classId ? { quiz: { classId: params.classId } } : {}),
    },
    select: {
      id: true,
      score: true,
      submittedAt: true,
      topicBreakdown: true,
      quiz: { select: { id: true, title: true, totalMarks: true, classId: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const topicMap: Record<string, { correct: number; total: number }> = {};
  for (const a of attempts) mergeTopicBreakdown(topicMap, a.topicBreakdown);

  return {
    attempts: attempts.map((a) => ({
      attemptId: a.id,
      quizId: a.quiz.id,
      quizTitle: a.quiz.title,
      classId: a.quiz.classId,
      score: a.score,
      totalMarks: a.quiz.totalMarks,
      percentage:
        a.quiz.totalMarks > 0
          ? Math.round(((a.score ?? 0) / a.quiz.totalMarks) * 1000) / 10
          : null,
      submittedAt: a.submittedAt,
      topicBreakdown: a.topicBreakdown,
    })),
    topicMastery: finalizeTopics(topicMap),
  };
}

export async function getQuizReportData(quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId },
    include: {
      class: { select: { id: true, title: true } },
      questions: { orderBy: { order: 'asc' }, select: { id: true, text: true, topic: true, marks: true } },
      attempts: {
        where: { submittedAt: { not: null } },
        include: { student: { select: { id: true, name: true, email: true } } },
        orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
      },
    },
  });
  if (!quiz) return null;

  const topicMap: Record<string, { correct: number; total: number }> = {};
  let scoreSum = 0;
  for (const a of quiz.attempts) {
    mergeTopicBreakdown(topicMap, a.topicBreakdown);
    scoreSum += a.score ?? 0;
  }
  const submitted = quiz.attempts.length;

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      totalMarks: quiz.totalMarks,
      classTitle: quiz.class.title,
      questionCount: quiz.questions.length,
    },
    attemptCount: submitted,
    averagePercentage:
      submitted > 0 && quiz.totalMarks > 0
        ? Math.round((scoreSum / (submitted * quiz.totalMarks)) * 1000) / 10
        : null,
    topicMastery: finalizeTopics(topicMap),
    leaderboard: quiz.attempts.map((a, i) => ({
      rank: i + 1,
      studentName: a.student.name,
      studentEmail: a.student.email,
      score: a.score,
      percentage:
        quiz.totalMarks > 0
          ? Math.round(((a.score ?? 0) / quiz.totalMarks) * 1000) / 10
          : null,
      submittedAt: a.submittedAt,
    })),
    questions: quiz.questions,
  };
}
