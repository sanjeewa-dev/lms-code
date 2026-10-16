import { prisma } from '../lib/prisma';

type TopicStat = { correct: number; total: number; percentage: number };

type StaffScope = { teacherId?: string; isAdmin: boolean };

function classScopeWhere(params: StaffScope) {
  return params.isAdmin ? undefined : { teacherId: params.teacherId };
}

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

type TopicTrend = 'up' | 'down' | 'flat';

function topicTrendFromAttempts(
  attempts: Array<{ topicBreakdown: unknown }>,
  topic: string
): TopicTrend {
  const series: number[] = [];
  for (const a of attempts) {
    const tb = a.topicBreakdown;
    if (!tb || typeof tb !== 'object') continue;
    const row = (tb as Record<string, TopicStat>)[topic];
    if (!row || typeof row !== 'object') continue;
    if (typeof row.percentage === 'number') series.push(row.percentage);
    else if (row.total > 0) series.push(Math.round((row.correct / row.total) * 1000) / 10);
  }
  if (series.length < 2) return 'flat';
  const mid = Math.floor(series.length / 2);
  const first = series.slice(0, mid);
  const second = series.slice(mid);
  const avg = (xs: number[]) => xs.reduce((s, n) => s + n, 0) / xs.length;
  const delta = avg(second) - avg(first);
  if (delta >= 5) return 'up';
  if (delta <= -5) return 'down';
  return 'flat';
}

function passOrImproveStreak(percentages: number[]): number {
  if (percentages.length === 0) return 0;
  let streak = 0;
  for (let i = percentages.length - 1; i >= 0; i--) {
    const p = percentages[i]!;
    const prev = i > 0 ? percentages[i - 1]! : null;
    const ok = p >= 50 || (prev != null && p > prev);
    if (!ok) break;
    streak += 1;
  }
  return streak;
}

function pct(score: number | null | undefined, totalMarks: number): number | null {
  if (score == null || totalMarks <= 0) return null;
  return Math.round((score / totalMarks) * 1000) / 10;
}

function medianOfScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
  }
  return sorted[mid]!;
}

function buildScoreDistribution(percentages: number[]) {
  const bands = [
    { band: '0–39%', min: 0, max: 39.999 },
    { band: '40–49%', min: 40, max: 49.999 },
    { band: '50–59%', min: 50, max: 59.999 },
    { band: '60–69%', min: 60, max: 69.999 },
    { band: '70–84%', min: 70, max: 84.999 },
    { band: '85–100%', min: 85, max: 100 },
  ];
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    band: `${i * 10}–${i * 10 + 9}%`,
    min: i * 10,
    max: i === 9 ? 100 : i * 10 + 9.999,
    count: 0,
  }));
  const bandRows = bands.map((b) => ({ ...b, count: 0 }));
  for (const p of percentages) {
    for (const b of bandRows) {
      if (p >= b.min && p <= b.max) {
        b.count += 1;
        break;
      }
    }
    const hi = Math.min(9, Math.floor(p / 10));
    histogram[hi]!.count += 1;
  }
  const avg =
    percentages.length > 0
      ? Math.round((percentages.reduce((s, n) => s + n, 0) / percentages.length) * 10) / 10
      : null;
  const passCount = percentages.filter((p) => p >= 50).length;
  return {
    gradedCount: percentages.length,
    averageScorePercent: avg,
    medianScorePercent: medianOfScores(percentages),
    highestScorePercent: percentages.length ? Math.max(...percentages) : null,
    lowestScorePercent: percentages.length ? Math.min(...percentages) : null,
    passCount,
    passRatePercent:
      percentages.length > 0
        ? Math.round((passCount / percentages.length) * 1000) / 10
        : null,
    bands: bandRows,
    histogram,
  };
}

function outcomeFromQuestionScores(questionScores: unknown): {
  correct: number;
  wrong: number;
  unanswered: number;
} {
  if (!Array.isArray(questionScores)) return { correct: 0, wrong: 0, unanswered: 0 };
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const row of questionScores as Array<{ correct?: boolean; earned?: number }>) {
    if (row?.correct === true) correct += 1;
    else if (row?.correct === false) wrong += 1;
    else unanswered += 1;
  }
  return { correct, wrong, unanswered };
}

export async function getClassesAnalytics(params: StaffScope) {
  const classes = await prisma.class.findMany({
    where: classScopeWhere(params),
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  type ClassAnalyticsRow = {
    classId: string;
    classTitle: string;
    attemptCount: number;
    averagePercentage: number | null;
    topicMastery: ReturnType<typeof finalizeTopics>;
  };
  const results: ClassAnalyticsRow[] = [];
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
      averagePercentage: marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      topicMastery: finalizeTopics(topicMap),
    });
  }
  return { classes: results };
}

export async function getQuizzesAnalytics(params: StaffScope & { classId?: string }) {
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
      const questionPerf = new Map<string, { correct: number; total: number; topic: string }>();
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

export async function getStudentsAnalytics(params: StaffScope & { classId?: string }) {
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
  type TopicRow = ReturnType<typeof finalizeTopics>[number];
  type StudentAnalyticsRow = {
    studentId: string;
    name: string;
    email: string;
    attemptCount: number;
    averagePercentage: number | null;
    topicMastery: ReturnType<typeof finalizeTopics>;
    strengths: TopicRow[];
    weaknesses: TopicRow[];
  };
  const students: StudentAnalyticsRow[] = [];
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
      averagePercentage: marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      topicMastery,
      strengths: topicMastery.filter((t) => t.percentage >= 70).slice(-3).reverse(),
      weaknesses: topicMastery.slice(0, 3),
    });
  }

  return { students };
}

export async function getStudentMastery(params: { studentId: string; classId?: string }) {
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
      questionScores: true,
      quiz: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classId: true,
          class: { select: { title: true } },
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const topicMap: Record<string, { correct: number; total: number }> = {};
  let correctTotal = 0;
  let wrongTotal = 0;
  let unansweredTotal = 0;
  for (const a of attempts) {
    mergeTopicBreakdown(topicMap, a.topicBreakdown);
    const o = outcomeFromQuestionScores(a.questionScores);
    correctTotal += o.correct;
    wrongTotal += o.wrong;
    unansweredTotal += o.unanswered;
  }

  const percentages = attempts
    .map((a) => pct(a.score, a.quiz.totalMarks))
    .filter((p): p is number => p != null);

  const latestPercentage = percentages.length > 0 ? percentages[percentages.length - 1]! : null;
  const previousPercentage = percentages.length > 1 ? percentages[percentages.length - 2]! : null;
  const deltaFromPrevious =
    latestPercentage != null && previousPercentage != null
      ? Math.round((latestPercentage - previousPercentage) * 10) / 10
      : null;

  const topicMastery = finalizeTopics(topicMap).map((row) => ({
    ...row,
    trend: topicTrendFromAttempts(attempts, row.topic),
  }));

  return {
    attempts: attempts.map((a) => ({
      attemptId: a.id,
      quizId: a.quiz.id,
      quizTitle: a.quiz.title,
      classId: a.quiz.classId,
      classTitle: a.quiz.class.title,
      score: a.score,
      totalMarks: a.quiz.totalMarks,
      percentage: pct(a.score, a.quiz.totalMarks),
      submittedAt: a.submittedAt,
      topicBreakdown: a.topicBreakdown,
      outcome: outcomeFromQuestionScores(a.questionScores),
    })),
    topicMastery,
    summary: {
      attemptCount: attempts.length,
      averagePercentage:
        percentages.length > 0
          ? Math.round((percentages.reduce((s, n) => s + n, 0) / percentages.length) * 10) / 10
          : null,
      completedCount: attempts.length,
      bestPercentage: percentages.length > 0 ? Math.max(...percentages) : null,
      latestPercentage,
      deltaFromPrevious,
      streak: passOrImproveStreak(percentages),
      outcomeMix: { correct: correctTotal, wrong: wrongTotal, unanswered: unansweredTotal },
    },
  };
}

const COHORT_MIN_PEERS = 3;
const FOCUS_TOPIC_MIN_QUESTIONS = 2;

/**
 * Actionable student progress: focus topics, anonymous class context, next steps.
 * Never includes classmate names or ids.
 */
export async function getStudentProgress(params: { studentId: string; classId?: string }) {
  const mastery = await getStudentMastery(params);
  const studentId = params.studentId;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: 'active',
      ...(params.classId ? { classId: params.classId } : {}),
    },
    include: { class: { select: { id: true, title: true } } },
  });
  const classIds = enrollments.map((e) => e.classId);

  const publishedQuizzes = classIds.length
    ? await prisma.quiz.findMany({
        where: { classId: { in: classIds }, isPublished: true },
        include: {
          class: { select: { id: true, title: true } },
          attempts: {
            where: { studentId, submittedAt: { not: null } },
            take: 1,
            select: { id: true },
          },
          _count: { select: { questions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      })
    : [];

  const pendingQuizzes = publishedQuizzes
    .filter((q) => q.attempts.length === 0)
    .slice(0, 8)
    .map((q) => ({
      id: q.id,
      title: q.title,
      classId: q.classId,
      classTitle: q.class.title,
      questionCount: q._count.questions,
      totalMarks: q.totalMarks,
    }));

  const publishedCount = publishedQuizzes.length;
  const completedCount = mastery.summary.completedCount;
  const outcome = mastery.summary.outcomeMix;
  const outcomeTotal = Math.max(1, outcome.correct + outcome.wrong + outcome.unanswered);
  const unansweredRate = Math.round((outcome.unanswered / outcomeTotal) * 1000) / 10;

  const focusTopics = mastery.topicMastery
    .filter((t) => t.total >= FOCUS_TOPIC_MIN_QUESTIONS)
    .slice(0, 5)
    .map((t) => ({
      topic: t.topic,
      percentage: t.percentage,
      missCount: Math.max(0, t.total - t.correct),
      total: t.total,
      trend: t.trend,
    }));

  const improvingTopics = mastery.topicMastery
    .filter((t) => t.trend === 'up' && t.total >= FOCUS_TOPIC_MIN_QUESTIONS)
    .slice(0, 5)
    .map((t) => ({
      topic: t.topic,
      percentage: t.percentage,
      total: t.total,
      trend: t.trend as TopicTrend,
    }));

  // Weakest recent attempt = lowest percentage among last 5
  const recent = [...mastery.attempts].slice(-5);
  const weakestRecent =
    recent.length === 0
      ? null
      : recent.reduce((worst, a) => {
          const p = a.percentage ?? -1;
          const wp = worst.percentage ?? -1;
          return p >= 0 && (wp < 0 || p < wp) ? a : worst;
        }, recent[0]!);

  const reviewAttempt = weakestRecent
    ? {
        attemptId: weakestRecent.attemptId,
        quizId: weakestRecent.quizId,
        quizTitle: weakestRecent.quizTitle,
        percentage: weakestRecent.percentage,
        classId: weakestRecent.classId,
      }
    : null;

  // Anonymous cohort per enrolled class
  const cohort: Array<{
    classId: string;
    classTitle: string;
    studentAveragePercent: number | null;
    classAveragePercent: number | null;
    band: 'top_25' | 'mid' | 'bottom_25' | null;
    peerCount: number;
    visible: boolean;
  }> = [];

  for (const enr of enrollments) {
    const classmateIds = (
      await prisma.enrollment.findMany({
        where: { classId: enr.classId, status: 'active' },
        select: { studentId: true },
      })
    )
      .map((e) => e.studentId)
      .filter((id) => id !== studentId);

    const peerAttempts = classmateIds.length
      ? await prisma.quizAttempt.findMany({
          where: {
            studentId: { in: classmateIds },
            submittedAt: { not: null },
            quiz: { classId: enr.classId, isPublished: true },
          },
          select: {
            studentId: true,
            score: true,
            quiz: { select: { totalMarks: true } },
          },
        })
      : [];

    const peerAverages = new Map<string, { sum: number; n: number }>();
    for (const a of peerAttempts) {
      const p = pct(a.score, a.quiz.totalMarks);
      if (p == null) continue;
      const cur = peerAverages.get(a.studentId) ?? { sum: 0, n: 0 };
      cur.sum += p;
      cur.n += 1;
      peerAverages.set(a.studentId, cur);
    }
    const peerMeans = [...peerAverages.values()]
      .filter((v) => v.n > 0)
      .map((v) => v.sum / v.n);
    const peerCount = peerMeans.length;
    const visible = peerCount >= COHORT_MIN_PEERS;

    const studentClassAttempts = mastery.attempts.filter((a) => a.classId === enr.classId);
    const studentPs = studentClassAttempts
      .map((a) => a.percentage)
      .filter((p): p is number => p != null);
    const studentAveragePercent =
      studentPs.length > 0
        ? Math.round((studentPs.reduce((s, n) => s + n, 0) / studentPs.length) * 10) / 10
        : null;

    let classAveragePercent: number | null = null;
    let band: 'top_25' | 'mid' | 'bottom_25' | null = null;
    if (visible) {
      const allMeans = [...peerMeans];
      if (studentAveragePercent != null) allMeans.push(studentAveragePercent);
      classAveragePercent =
        Math.round((allMeans.reduce((s, n) => s + n, 0) / allMeans.length) * 10) / 10;
      if (studentAveragePercent != null) {
        const sorted = [...allMeans].sort((a, b) => a - b);
        const rank = sorted.filter((v) => v < studentAveragePercent).length;
        const pctile = rank / Math.max(1, sorted.length - 1);
        if (pctile >= 0.75) band = 'top_25';
        else if (pctile <= 0.25) band = 'bottom_25';
        else band = 'mid';
      }
    }

    cohort.push({
      classId: enr.classId,
      classTitle: enr.class.title,
      studentAveragePercent,
      classAveragePercent,
      band,
      peerCount,
      visible,
    });
  }

  return {
    summary: {
      ...mastery.summary,
      publishedQuizCount: publishedCount,
      quizzesAvailable: Math.max(0, publishedCount - completedCount),
      unansweredRate,
    },
    focusTopics,
    improvingTopics,
    nextActions: {
      pendingQuizzes,
      reviewAttempt,
    },
    cohort,
    consistency: {
      completedCount,
      publishedCount,
      unansweredRate,
    },
  };
}

export async function getQuizReportData(quizId: string) {
  const detail = await getQuizDetail(quizId);
  if (!detail) return null;
  return {
    quiz: {
      id: detail.quiz.id,
      title: detail.quiz.title,
      totalMarks: detail.quiz.totalMarks,
      classTitle: detail.quiz.className,
      questionCount: detail.quiz.totalQuestions,
    },
    attemptCount: detail.kpis.markedCount,
    averagePercentage: detail.kpis.averageScorePercent,
    topicMastery: detail.topicMastery,
    leaderboard: detail.submissions.map((s, i) => ({
      rank: i + 1,
      studentName: s.studentName,
      studentEmail: s.studentEmail,
      score: s.earned,
      percentage: s.scorePercent,
      submittedAt: s.submittedAt,
    })),
    questions: detail.questions,
    scoreDistribution: detail.scoreDistribution,
    questionDifficulty: detail.questionDifficulty,
  };
}

/** Dashboard summary for staff analytics shell + widgets. */
export async function getAnalyticsDashboard(params: StaffScope) {
  const classes = await prisma.class.findMany({
    where: classScopeWhere(params),
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });
  const classIds = classes.map((c) => c.id);

  const quizzes = await prisma.quiz.findMany({
    where: { classId: { in: classIds } },
    select: {
      id: true,
      title: true,
      classId: true,
      totalMarks: true,
      isPublished: true,
      createdAt: true,
      class: { select: { title: true } },
      questions: { select: { topic: true } },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      submittedAt: { not: null },
      quiz: { classId: { in: classIds } },
    },
    select: {
      id: true,
      score: true,
      submittedAt: true,
      topicBreakdown: true,
      studentId: true,
      student: { select: { id: true, name: true } },
      quiz: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classId: true,
          class: { select: { title: true } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'active', classId: { in: classIds } },
    select: {
      classId: true,
      student: { select: { id: true, name: true } },
    },
  });

  let scoreSum = 0;
  let marksSum = 0;
  const percentages: number[] = [];
  const topicMap: Record<string, { correct: number; total: number }> = {};
  const topicByQuiz: Record<string, Record<string, { correct: number; total: number }>> = {};
  const byQuizAgg = new Map<string, { scoreSum: number; count: number; totalMarks: number; title: string; className: string }>();

  for (const a of attempts) {
    mergeTopicBreakdown(topicMap, a.topicBreakdown);
    if (!topicByQuiz[a.quiz.id]) topicByQuiz[a.quiz.id] = {};
    mergeTopicBreakdown(topicByQuiz[a.quiz.id]!, a.topicBreakdown);
    scoreSum += a.score ?? 0;
    marksSum += a.quiz.totalMarks || 0;
    const p = pct(a.score, a.quiz.totalMarks);
    if (p != null) percentages.push(p);
    const cur = byQuizAgg.get(a.quiz.id) ?? {
      scoreSum: 0,
      count: 0,
      totalMarks: a.quiz.totalMarks,
      title: a.quiz.title,
      className: a.quiz.class.title,
    };
    cur.scoreSum += a.score ?? 0;
    cur.count += 1;
    byQuizAgg.set(a.quiz.id, cur);
  }

  const dist = buildScoreDistribution(percentages);

  // Top performers per class
  const studentClassScores = new Map<string, { name: string; classId: string; className: string; scoreSum: number; marksSum: number; count: number }>();
  for (const a of attempts) {
    const key = `${a.quiz.classId}:${a.studentId}`;
    const cur = studentClassScores.get(key) ?? {
      name: a.student.name,
      classId: a.quiz.classId,
      className: a.quiz.class.title,
      scoreSum: 0,
      marksSum: 0,
      count: 0,
    };
    cur.scoreSum += a.score ?? 0;
    cur.marksSum += a.quiz.totalMarks || 0;
    cur.count += 1;
    studentClassScores.set(key, cur);
  }
  const topPerformersByClass = classes.map((c) => {
    const rows = [...studentClassScores.entries()]
      .filter(([, v]) => v.classId === c.id)
      .map(([key, v]) => ({
        studentId: key.split(':')[1]!,
        studentName: v.name,
        scorePercent: v.marksSum > 0 ? Math.round((v.scoreSum / v.marksSum) * 1000) / 10 : 0,
        papersGraded: v.count,
      }))
      .sort((a, b) => b.scorePercent - a.scorePercent)
      .slice(0, 3);
    return { classId: c.id, className: c.title, students: rows };
  });

  const studentClassIds = new Map<string, Set<string>>();
  for (const e of enrollments) {
    const set = studentClassIds.get(e.student.id) ?? new Set();
    set.add(e.classId);
    studentClassIds.set(e.student.id, set);
  }

  const topicsByQuizId: Record<string, string[]> = {};
  for (const q of quizzes) {
    const fromQuestions = [...new Set(q.questions.map((x) => x.topic?.trim() || 'General'))];
    const fromAttempts = Object.keys(topicByQuiz[q.id] ?? {});
    topicsByQuizId[q.id] = [...new Set([...fromQuestions, ...fromAttempts])].sort();
  }

  const byAssessment = [...byQuizAgg.entries()].map(([quizId, v]) => ({
    assessmentId: quizId,
    quizId,
    title: v.title,
    className: v.className,
    gradedCount: v.count,
    averageScorePercent:
      v.count > 0 && v.totalMarks > 0
        ? Math.round((v.scoreSum / (v.count * v.totalMarks)) * 1000) / 10
        : null,
  }));

  return {
    summary: {
      classCount: classes.length,
      assessmentCount: quizzes.length,
      quizCount: quizzes.length,
      totalSubmissions: attempts.length,
      gradedSubmissions: attempts.length,
      averageScorePercent: marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      pendingManualReview: 0,
    },
    scoreDistribution: dist.bands.map((b) => ({ band: b.band, count: b.count })),
    byAssessment,
    topicAggregate: finalizeTopics(topicMap),
    topicAggregateByAssessmentId: Object.fromEntries(
      Object.entries(topicByQuiz).map(([id, map]) => [id, finalizeTopics(map)])
    ),
    recentGrades: attempts.slice(0, 12).map((a) => ({
      submissionId: a.id,
      attemptId: a.id,
      studentName: a.student.name,
      assessmentTitle: a.quiz.title,
      quizTitle: a.quiz.title,
      className: a.quiz.class.title,
      scorePercent: pct(a.score, a.quiz.totalMarks) ?? 0,
      gradedAt: a.submittedAt?.toISOString() ?? '',
    })),
    topPerformersByClass,
    filterOptions: {
      classes: classes.map((c) => ({ id: c.id, name: c.title })),
      assessments: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        classId: q.classId,
        className: q.class.title,
        lastGradedAt: null as string | null,
      })),
      quizzes: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        classId: q.classId,
        className: q.class.title,
      })),
      students: [...studentClassIds.entries()].map(([id, classSet]) => {
        const name =
          enrollments.find((e) => e.student.id === id)?.student.name ?? 'Student';
        return { id, fullName: name, classIds: [...classSet] };
      }),
      topics: finalizeTopics(topicMap).map((t) => t.topic),
      topicsByAssessmentId: topicsByQuizId,
    },
  };
}

export async function getTrendSeries(params: StaffScope & {
  classId?: string;
  quizId?: string;
  studentId?: string;
  topic?: string;
}) {
  const seriesMode = params.studentId ? 'student_submissions' : 'cohort_submissions';

  const quizzes = await prisma.quiz.findMany({
    where: {
      ...(params.quizId ? { id: params.quizId } : {}),
      ...(params.classId ? { classId: params.classId } : {}),
      ...(params.isAdmin ? {} : { class: { teacherId: params.teacherId } }),
    },
    select: { id: true, title: true, totalMarks: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  type ProgressPoint = {
    at: string;
    scorePercent: number;
    sampleCount: number;
    assessmentTitle: string;
    assessmentId: string;
    quizId: string;
    quizTitle: string;
  };
  const points: ProgressPoint[] = [];
  for (const quiz of quizzes) {
    const attempts = await prisma.quizAttempt.findMany({
      where: {
        quizId: quiz.id,
        submittedAt: { not: null },
        ...(params.studentId ? { studentId: params.studentId } : {}),
      },
      select: { score: true, submittedAt: true, topicBreakdown: true },
    });
    if (!attempts.length) continue;

    let scores: number[] = [];
    if (params.topic) {
      for (const a of attempts) {
        const tb = a.topicBreakdown as Record<string, TopicStat> | null;
        const stat = tb?.[params.topic];
        if (stat && typeof stat.percentage === 'number') scores.push(stat.percentage);
        else if (stat && stat.total > 0) scores.push(Math.round((stat.correct / stat.total) * 1000) / 10);
      }
    } else {
      scores = attempts
        .map((a) => pct(a.score, quiz.totalMarks))
        .filter((p): p is number => p != null);
    }
    if (!scores.length) continue;
    const latest = attempts.reduce((max, a) => {
      const t = a.submittedAt?.getTime() ?? 0;
      return t > max ? t : max;
    }, 0);
    points.push({
      at: new Date(latest || quiz.createdAt).toISOString(),
      scorePercent: Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10,
      sampleCount: scores.length,
      assessmentTitle: quiz.title,
      assessmentId: quiz.id,
      quizId: quiz.id,
      quizTitle: quiz.title,
    });
  }

  return { seriesMode, points };
}

export async function getCohortLeaderboard(params: StaffScope & {
  classId?: string;
  quizId?: string;
  size?: number;
}) {
  const size = params.size ?? 5;
  if (params.quizId) {
    const quiz = await prisma.quiz.findFirst({
      where: {
        id: params.quizId,
        ...(params.isAdmin ? {} : { class: { teacherId: params.teacherId } }),
      },
      include: {
        attempts: {
          where: { submittedAt: { not: null } },
          include: { student: { select: { id: true, name: true } } },
        },
      },
    });
    if (!quiz) return null;
    const performers = quiz.attempts
      .map((a) => ({
        studentId: a.student.id,
        studentName: a.student.name,
        rollNumber: null as string | null,
        scorePercent: pct(a.score, quiz.totalMarks) ?? 0,
        papersGraded: 1,
        earned: a.score,
        possible: quiz.totalMarks,
        assessmentId: quiz.id,
        assessmentTitle: quiz.title,
        quizId: quiz.id,
        quizTitle: quiz.title,
      }))
      .sort((a, b) => b.scorePercent - a.scorePercent);
    return {
      scope: 'single_assessment' as const,
      assessmentId: quiz.id,
      assessmentTitle: quiz.title,
      quizId: quiz.id,
      quizTitle: quiz.title,
      size,
      totalPerformers: performers.length,
      top: performers.slice(0, size),
      bottom: [...performers].reverse().slice(0, size),
    };
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      submittedAt: { not: null },
      ...(params.classId ? { quiz: { classId: params.classId } } : {}),
      ...(params.isAdmin ? {} : { quiz: { class: { teacherId: params.teacherId } } }),
    },
    select: {
      score: true,
      studentId: true,
      student: { select: { id: true, name: true } },
      quiz: { select: { totalMarks: true } },
    },
  });
  const byStudent = new Map<string, { name: string; scoreSum: number; marksSum: number; count: number }>();
  for (const a of attempts) {
    const cur = byStudent.get(a.studentId) ?? {
      name: a.student.name,
      scoreSum: 0,
      marksSum: 0,
      count: 0,
    };
    cur.scoreSum += a.score ?? 0;
    cur.marksSum += a.quiz.totalMarks || 0;
    cur.count += 1;
    byStudent.set(a.studentId, cur);
  }
  const performers = [...byStudent.entries()]
    .map(([studentId, v]) => ({
      studentId,
      studentName: v.name,
      rollNumber: null as string | null,
      scorePercent: v.marksSum > 0 ? Math.round((v.scoreSum / v.marksSum) * 1000) / 10 : 0,
      papersGraded: v.count,
      earned: null as number | null,
      possible: null as number | null,
      assessmentId: null as string | null,
      assessmentTitle: null as string | null,
      quizId: null as string | null,
      quizTitle: null as string | null,
    }))
    .sort((a, b) => b.scorePercent - a.scorePercent);

  return {
    scope: 'all_assessments' as const,
    assessmentId: null,
    assessmentTitle: null,
    quizId: null,
    quizTitle: null,
    size,
    totalPerformers: performers.length,
    top: performers.slice(0, size),
    bottom: [...performers].reverse().slice(0, size),
  };
}

export async function getCohortScoreDistribution(params: StaffScope & {
  classId?: string;
  quizId?: string;
}) {
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      submittedAt: { not: null },
      ...(params.quizId ? { quizId: params.quizId } : {}),
      ...(params.classId && !params.quizId ? { quiz: { classId: params.classId } } : {}),
      ...(params.isAdmin ? {} : { quiz: { class: { teacherId: params.teacherId } } }),
    },
    select: {
      score: true,
      quiz: { select: { id: true, title: true, totalMarks: true } },
    },
  });
  const percentages = attempts
    .map((a) => pct(a.score, a.quiz.totalMarks))
    .filter((p): p is number => p != null);
  const dist = buildScoreDistribution(percentages);
  const quizMeta = params.quizId ? attempts[0]?.quiz : null;
  return {
    scope: params.quizId ? ('single_assessment' as const) : ('all_assessments' as const),
    assessmentId: quizMeta?.id ?? null,
    assessmentTitle: quizMeta?.title ?? null,
    quizId: quizMeta?.id ?? null,
    quizTitle: quizMeta?.title ?? null,
    classId: params.classId ?? null,
    ...dist,
  };
}

export async function getClassOverview(params: StaffScope & { classId: string }) {
  const klass = await prisma.class.findFirst({
    where: {
      id: params.classId,
      ...(params.isAdmin ? {} : { teacherId: params.teacherId }),
    },
    select: { id: true, title: true },
  });
  if (!klass) return null;

  const enrolled = await prisma.enrollment.count({
    where: { classId: klass.id, status: 'active' },
  });
  const quizzes = await prisma.quiz.findMany({
    where: { classId: klass.id },
    select: {
      id: true,
      title: true,
      isPublished: true,
      totalMarks: true,
      createdAt: true,
      _count: { select: { attempts: true, questions: true } },
      attempts: {
        where: { submittedAt: { not: null } },
        select: { score: true, studentId: true, student: { select: { id: true, name: true } }, topicBreakdown: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const topicMap: Record<string, { correct: number; total: number }> = {};
  const studentAgg = new Map<string, { name: string; scoreSum: number; marksSum: number; count: number }>();
  let allPercents: number[] = [];
  let submittedUnique = new Set<string>();
  let markedCount = 0;

  const assessments = quizzes.map((q) => {
    let scoreSum = 0;
    const percents: number[] = [];
    for (const a of q.attempts) {
      mergeTopicBreakdown(topicMap, a.topicBreakdown);
      scoreSum += a.score ?? 0;
      markedCount += 1;
      submittedUnique.add(a.studentId);
      const p = pct(a.score, q.totalMarks);
      if (p != null) {
        percents.push(p);
        allPercents.push(p);
      }
      const cur = studentAgg.get(a.studentId) ?? {
        name: a.student.name,
        scoreSum: 0,
        marksSum: 0,
        count: 0,
      };
      cur.scoreSum += a.score ?? 0;
      cur.marksSum += q.totalMarks || 0;
      cur.count += 1;
      studentAgg.set(a.studentId, cur);
    }
    const pass = percents.filter((p) => p >= 50).length;
    return {
      assessmentId: q.id,
      quizId: q.id,
      title: q.title,
      status: q.isPublished ? 'published' : 'draft',
      startTime: q.createdAt.toISOString(),
      submissionCount: q.attempts.length,
      expectedCount: enrolled,
      markedCount: q.attempts.length,
      averageScorePercent:
        q.attempts.length > 0 && q.totalMarks > 0
          ? Math.round((scoreSum / (q.attempts.length * q.totalMarks)) * 1000) / 10
          : null,
      passRatePercent:
        percents.length > 0 ? Math.round((pass / percents.length) * 1000) / 10 : null,
    };
  });

  const performers = [...studentAgg.entries()]
    .map(([studentId, v]) => ({
      studentId,
      studentName: v.name,
      rollNumber: null as string | null,
      scorePercent: v.marksSum > 0 ? Math.round((v.scoreSum / v.marksSum) * 1000) / 10 : 0,
      papersGraded: v.count,
      earned: null as number | null,
      possible: null as number | null,
      assessmentId: null as string | null,
      assessmentTitle: null as string | null,
    }))
    .sort((a, b) => b.scorePercent - a.scorePercent);

  const expected = enrolled * quizzes.filter((q) => q.isPublished).length;
  const dist = buildScoreDistribution(allPercents);

  return {
    classId: klass.id,
    className: klass.title,
    kpis: {
      enrolledStudents: enrolled,
      totalAssessments: quizzes.length,
      totalQuizzes: quizzes.length,
      activeAssessments: quizzes.filter((q) => q.isPublished).length,
      submissionRatePercent:
        expected > 0 ? Math.round((markedCount / expected) * 1000) / 10 : null,
      averageScorePercent: dist.averageScorePercent,
      passRatePercent: dist.passRatePercent,
    },
    funnel: {
      expected,
      submitted: markedCount,
      marked: markedCount,
      reviewInProgress: 0,
      failed: 0,
    },
    topPerformers: performers.slice(0, 3),
    bottomPerformers: [...performers].reverse().slice(0, 3),
    scoreDistribution: {
      scope: 'all_assessments' as const,
      assessmentId: null,
      assessmentTitle: null,
      classId: klass.id,
      ...dist,
    },
    topicMastery: finalizeTopics(topicMap),
    assessments,
    quizzes: assessments,
  };
}

export async function getStudentsEngagement(params: StaffScope & {
  classId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 100;
  const classFilter = params.classId
    ? { id: params.classId }
    : params.isAdmin
      ? undefined
      : { teacherId: params.teacherId };

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'active', ...(classFilter ? { class: classFilter } : {}) },
    select: {
      classId: true,
      class: { select: { id: true, title: true } },
      student: { select: { id: true, name: true } },
    },
  });

  const classIds = [...new Set(enrollments.map((e) => e.classId))];
  const quizzesByClass = await prisma.quiz.groupBy({
    by: ['classId'],
    where: { classId: { in: classIds }, isPublished: true },
    _count: { _all: true },
  });
  const expectedMap = new Map(quizzesByClass.map((r) => [r.classId, r._count._all]));

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      submittedAt: { not: null },
      quiz: { classId: { in: classIds } },
    },
    select: {
      studentId: true,
      score: true,
      submittedAt: true,
      quiz: { select: { classId: true, totalMarks: true, createdAt: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const rows = enrollments.map((e) => {
    const studentAttempts = attempts.filter(
      (a) => a.studentId === e.student.id && a.quiz.classId === e.classId
    );
    let scoreSum = 0;
    let marksSum = 0;
    const chron: number[] = [];
    let last: Date | null = null;
    for (const a of studentAttempts) {
      scoreSum += a.score ?? 0;
      marksSum += a.quiz.totalMarks || 0;
      const p = pct(a.score, a.quiz.totalMarks);
      if (p != null) chron.push(p);
      if (a.submittedAt && (!last || a.submittedAt > last)) last = a.submittedAt;
    }
    let trend: 'up' | 'down' | 'flat' | null = null;
    if (chron.length >= 2) {
      const delta = chron[chron.length - 1]! - chron[0]!;
      trend = delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat';
    }
    const expected = expectedMap.get(e.classId) ?? 0;
    return {
      studentId: e.student.id,
      studentName: e.student.name,
      rollNumber: null as string | null,
      classId: e.classId,
      className: e.class.title,
      expectedAssessments: expected,
      submittedCount: studentAttempts.length,
      markedCount: studentAttempts.length,
      averageScorePercent: marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null,
      lastActivityAt: last?.toISOString() ?? null,
      trend,
    };
  });

  rows.sort((a, b) => (a.averageScorePercent ?? -1) - (b.averageScorePercent ?? -1));
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { total, page, pageSize, rows: rows.slice(start, start + pageSize) };
}

export async function getQuizDetail(quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId },
    include: {
      class: { select: { id: true, title: true, teacherId: true } },
      questions: {
        orderBy: { order: 'asc' },
        select: { id: true, text: true, topic: true, marks: true, order: true },
      },
      attempts: {
        where: { submittedAt: { not: null } },
        include: { student: { select: { id: true, name: true, email: true } } },
        orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
      },
    },
  });
  if (!quiz) return null;

  const enrolled = await prisma.enrollment.count({
    where: { classId: quiz.classId, status: 'active' },
  });

  const topicMap: Record<string, { correct: number; total: number }> = {};
  const questionPerf = new Map<string, { correct: number; total: number; topic: string; text: string }>();
  for (const q of quiz.questions) {
    questionPerf.set(q.id, { correct: 0, total: 0, topic: q.topic || 'General', text: q.text });
  }

  const percentages: number[] = [];
  let scoreSum = 0;
  for (const a of quiz.attempts) {
    mergeTopicBreakdown(topicMap, a.topicBreakdown);
    scoreSum += a.score ?? 0;
    const p = pct(a.score, quiz.totalMarks);
    if (p != null) percentages.push(p);
    const scores = Array.isArray(a.questionScores) ? (a.questionScores as any[]) : [];
    for (const row of scores) {
      if (!row?.questionId) continue;
      const cur = questionPerf.get(row.questionId);
      if (!cur) continue;
      cur.total += 1;
      if (row.correct) cur.correct += 1;
    }
  }

  const dist = buildScoreDistribution(percentages);
  const leaderboard = await getCohortLeaderboard({
    isAdmin: true,
    quizId: quiz.id,
    size: 5,
  });

  return {
    assessment: {
      id: quiz.id,
      title: quiz.title,
      classId: quiz.class.id,
      className: quiz.class.title,
      totalQuestions: quiz.questions.length,
      status: quiz.isPublished ? 'published' : 'draft',
      startTime: quiz.createdAt.toISOString(),
      endTime: null as string | null,
    },
    quiz: {
      id: quiz.id,
      title: quiz.title,
      classId: quiz.class.id,
      className: quiz.class.title,
      teacherId: quiz.class.teacherId,
      totalQuestions: quiz.questions.length,
      totalMarks: quiz.totalMarks,
      status: quiz.isPublished ? 'published' : 'draft',
      startTime: quiz.createdAt.toISOString(),
      endTime: null as string | null,
    },
    kpis: {
      totalQuestions: quiz.questions.length,
      submissions: quiz.attempts.length,
      expectedSubmissions: enrolled,
      markedCount: quiz.attempts.length,
      averageScorePercent: dist.averageScorePercent,
      passRatePercent: dist.passRatePercent,
      pendingReview: 0,
    },
    pipeline: {
      submitted: quiz.attempts.length,
      marked: quiz.attempts.length,
      reviewInProgress: 0,
      failed: 0,
      expected: enrolled,
    },
    scoreDistribution: {
      scope: 'single_assessment' as const,
      assessmentId: quiz.id,
      assessmentTitle: quiz.title,
      quizId: quiz.id,
      quizTitle: quiz.title,
      ...dist,
    },
    leaderboard,
    questionDifficulty: [...questionPerf.entries()].map(([questionId, v]) => ({
      questionId,
      questionNumber: (quiz.questions.find((q) => q.id === questionId)?.order ?? 0) + 1,
      prompt: v.text,
      topic: v.topic,
      correctCount: v.correct,
      totalAttempts: v.total,
      correctRatePercent: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
    })),
    topicMastery: finalizeTopics(topicMap),
    timeAnalytics: null,
    bulkHealth: null,
    submissions: quiz.attempts.map((a) => ({
      submissionId: a.id,
      attemptId: a.id,
      studentId: a.student.id,
      studentName: a.student.name,
      studentEmail: a.student.email,
      scorePercent: pct(a.score, quiz.totalMarks),
      earned: a.score,
      possible: quiz.totalMarks,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      status: 'scored',
    })),
    questions: quiz.questions,
  };
}

export async function getStudentDetail(params: StaffScope & {
  studentId: string;
  classId?: string;
}) {
  const student = await prisma.user.findFirst({
    where: { id: params.studentId, role: 'student' },
    select: { id: true, name: true, email: true },
  });
  if (!student) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: student.id,
      status: 'active',
      ...(params.classId ? { classId: params.classId } : {}),
      ...(params.isAdmin ? {} : { class: { teacherId: params.teacherId } }),
    },
    select: { classId: true, class: { select: { id: true, title: true } } },
  });
  if (!enrollments.length) return null;

  const classIds = enrollments.map((e) => e.classId);
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      studentId: student.id,
      submittedAt: { not: null },
      quiz: { classId: { in: classIds } },
    },
    select: {
      id: true,
      score: true,
      submittedAt: true,
      topicBreakdown: true,
      quiz: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classId: true,
          class: { select: { title: true } },
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const topicMap: Record<string, { correct: number; total: number }> = {};
  const chron: number[] = [];
  let scoreSum = 0;
  let marksSum = 0;
  for (const a of attempts) {
    mergeTopicBreakdown(topicMap, a.topicBreakdown);
    scoreSum += a.score ?? 0;
    marksSum += a.quiz.totalMarks || 0;
    const p = pct(a.score, a.quiz.totalMarks);
    if (p != null) chron.push(p);
  }
  const topicMastery = finalizeTopics(topicMap);
  const avg = marksSum > 0 ? Math.round((scoreSum / marksSum) * 1000) / 10 : null;

  // Cohort averages per quiz for student-vs-cohort
  const quizIds = [...new Set(attempts.map((a) => a.quiz.id))];
  const cohortAttempts = await prisma.quizAttempt.findMany({
    where: { quizId: { in: quizIds }, submittedAt: { not: null } },
    select: { quizId: true, score: true, quiz: { select: { totalMarks: true } } },
  });
  const cohortByQuiz = new Map<string, number[]>();
  for (const a of cohortAttempts) {
    const p = pct(a.score, a.quiz.totalMarks);
    if (p == null) continue;
    const list = cohortByQuiz.get(a.quizId) ?? [];
    list.push(p);
    cohortByQuiz.set(a.quizId, list);
  }

  const studentVsCohort = attempts.map((a) => {
    const cohort = cohortByQuiz.get(a.quiz.id) ?? [];
    const cohortAvg =
      cohort.length > 0
        ? Math.round((cohort.reduce((s, n) => s + n, 0) / cohort.length) * 10) / 10
        : null;
    return {
      assessmentId: a.quiz.id,
      assessmentTitle: a.quiz.title,
      quizId: a.quiz.id,
      quizTitle: a.quiz.title,
      studentPercent: pct(a.score, a.quiz.totalMarks),
      cohortPercent: cohortAvg,
    };
  });

  let improvement: { delta: number | null; label: string } = {
    delta: null,
    label: 'Not enough attempts yet',
  };
  if (chron.length >= 2) {
    const delta = Math.round((chron[chron.length - 1]! - chron[0]!) * 10) / 10;
    improvement = {
      delta,
      label: delta > 0 ? 'Improving' : delta < 0 ? 'Declining' : 'Stable',
    };
  }

  const studentsNeedingAttention = avg != null && avg < 50;

  return {
    profile: {
      studentId: student.id,
      fullName: student.name,
      email: student.email,
      classes: enrollments.map((e) => ({ id: e.class.id, name: e.class.title })),
    },
    kpis: {
      papersGraded: attempts.length,
      averageScorePercent: avg,
      bestScorePercent: chron.length ? Math.max(...chron) : null,
      latestScorePercent: chron.length ? chron[chron.length - 1]! : null,
      needsAttention: studentsNeedingAttention,
    },
    improvement,
    topicMastery,
    strengths: topicMastery.filter((t) => t.percentage >= 70).slice(-3).reverse(),
    weaknesses: topicMastery.slice(0, 3),
    studentVsCohort,
    assessments: attempts.map((a) => ({
      assessmentId: a.quiz.id,
      assessmentTitle: a.quiz.title,
      quizId: a.quiz.id,
      quizTitle: a.quiz.title,
      className: a.quiz.class.title,
      scorePercent: pct(a.score, a.quiz.totalMarks),
      earned: a.score,
      possible: a.quiz.totalMarks,
      submittedAt: a.submittedAt?.toISOString() ?? null,
    })),
    recentActivity: attempts
      .slice()
      .reverse()
      .slice(0, 10)
      .map((a) => ({
        at: a.submittedAt?.toISOString() ?? '',
        label: `Scored ${pct(a.score, a.quiz.totalMarks) ?? '—'}% on ${a.quiz.title}`,
        assessmentTitle: a.quiz.title,
        scorePercent: pct(a.score, a.quiz.totalMarks),
      })),
  };
}

export async function getCohortOverview(params: StaffScope & { classId?: string }) {
  const engagement = await getStudentsEngagement({ ...params, pageSize: 500 });
  const withAvg = engagement.rows.filter((r) => r.averageScorePercent != null);
  const needing = withAvg.filter((r) => (r.averageScorePercent ?? 100) < 50);
  const avg =
    withAvg.length > 0
      ? Math.round(
          (withAvg.reduce((s, r) => s + (r.averageScorePercent ?? 0), 0) / withAvg.length) * 10
        ) / 10
      : null;

  return {
    kpis: {
      activeStudents: engagement.total,
      cohortAveragePercent: avg,
      studentsNeedingAttention: needing.length,
    },
    needingAttention: needing,
    engagement: engagement.rows,
  };
}
