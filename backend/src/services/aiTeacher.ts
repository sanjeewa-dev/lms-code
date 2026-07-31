import { prisma } from '../lib/prisma';
import { callAnthropic, parseJsonObject } from './anthropic';
import { forbidden, notFound, badRequest } from '../utils/httpError';
import { assertFeature } from './planGates';

export type TeacherAiToolId = 'quiz-gen' | 'feedback' | 'weak-topics' | 'intervention';

async function assertTeacherClass(teacherId: string, classId: string, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('Institute not found');
  assertFeature(tenant, 'aiTeacher');

  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    select: { id: true, title: true, description: true, teacherId: true },
  });
  if (!cls) throw notFound('Class not found');

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId },
    select: { role: true },
  });
  if (!teacher) throw forbidden('Not allowed');
  if (teacher.role === 'teacher' && cls.teacherId !== teacherId) {
    throw forbidden('You can only use AI Copilot on your own classes');
  }
  return cls;
}

export async function saveTeacherAiHistory(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
  tool: TeacherAiToolId;
  title: string;
  payload: Record<string, unknown>;
}) {
  return prisma.aiToolHistory.create({
    data: {
      tenantId: opts.tenantId,
      studentId: opts.teacherId, // owner user id (shared history table)
      classId: opts.classId,
      tool: opts.tool,
      title: opts.title.slice(0, 180),
      payload: opts.payload,
    },
  });
}

export async function listTeacherAiHistory(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
  tool: TeacherAiToolId;
  take?: number;
}) {
  await assertTeacherClass(opts.teacherId, opts.classId, opts.tenantId);
  const rows = await prisma.aiToolHistory.findMany({
    where: {
      tenantId: opts.tenantId,
      studentId: opts.teacherId,
      classId: opts.classId,
      tool: opts.tool,
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 30,
  });
  return rows.map((r) => ({
    id: r.id,
    tool: r.tool,
    title: r.title,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function getClassContext(classId: string) {
  const [cls, quizzes, recentAttempts] = await Promise.all([
    prisma.class.findFirst({
      where: { id: classId },
      select: { title: true, description: true },
    }),
    prisma.quiz.findMany({
      where: { classId, isPublished: true },
      select: { id: true, title: true, totalMarks: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.quizAttempt.findMany({
      where: { quiz: { classId }, submittedAt: { not: null } },
      include: { quiz: { select: { totalMarks: true } } },
      orderBy: { submittedAt: 'desc' },
      take: 60,
    }),
  ]);
  return { cls, quizzes, recentAttempts };
}

/** Generate quiz questions from a topic or pasted notes. */
export async function teacherGenerateQuiz(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
  topic: string;
  notes?: string;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}) {
  await assertTeacherClass(opts.teacherId, opts.classId, opts.tenantId);
  const { cls } = await getClassContext(opts.classId);

  const count = Math.min(opts.count ?? 5, 10);
  const difficulty = opts.difficulty ?? 'medium';

  const system = `You are an expert teacher AI assistant. Generate multiple-choice quiz questions for a class. Always respond with valid JSON only, no markdown.`;
  const user = `Class: "${cls?.title ?? ''}"
Topic: "${opts.topic}"
${opts.notes ? `Notes/Context:\n${opts.notes.slice(0, 3000)}` : ''}
Difficulty: ${difficulty}
Count: ${count}

Generate exactly ${count} multiple-choice questions. Return JSON:
{
  "title": "Quiz on [topic]",
  "questions": [
    {
      "text": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "marks": 1,
      "explanation": "Why this answer is correct"
    }
  ]
}`;

  const raw = await callAnthropic({ system, user, maxTokens: 2000 });
  if (!raw) throw badRequest('AI service unavailable. Please check your API key.');

  const parsed = parseJsonObject<{ title: string; questions: unknown[] }>(raw);
  if (!parsed?.questions?.length) throw badRequest('AI returned an unexpected format. Try again.');

  const saved = await saveTeacherAiHistory({
    tenantId: opts.tenantId,
    teacherId: opts.teacherId,
    classId: opts.classId,
    tool: 'quiz-gen',
    title: parsed.title || `Quiz: ${opts.topic}`,
    payload: {
      topic: opts.topic,
      difficulty,
      count,
      title: parsed.title,
      questions: parsed.questions,
    },
  });

  return { ...parsed, historyId: saved.id };
}

/** Draft feedback for a student submission. */
export async function teacherDraftFeedback(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
  studentName: string;
  assignmentTitle: string;
  submissionText: string;
  maxMarks?: number;
}) {
  await assertTeacherClass(opts.teacherId, opts.classId, opts.tenantId);

  const system = `You are a helpful, encouraging teacher. Draft fair, constructive assignment feedback. Always respond with JSON only, no markdown.`;
  const user = `Assignment: "${opts.assignmentTitle}"
Student: ${opts.studentName}
Max Marks: ${opts.maxMarks ?? 'not specified'}
Submission:
${opts.submissionText.slice(0, 4000)}

Draft feedback. Return JSON:
{
  "suggestedGrade": <number or null>,
  "feedback": "Encouraging, constructive feedback (2-4 sentences)",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}`;

  const raw = await callAnthropic({ system, user, maxTokens: 600 });
  if (!raw) throw badRequest('AI service unavailable. Please check your API key.');

  const parsed = parseJsonObject<{
    suggestedGrade: number | null;
    feedback: string;
    strengths: string[];
    improvements: string[];
  }>(raw);
  if (!parsed?.feedback) throw badRequest('AI returned an unexpected format. Try again.');

  const saved = await saveTeacherAiHistory({
    tenantId: opts.tenantId,
    teacherId: opts.teacherId,
    classId: opts.classId,
    tool: 'feedback',
    title: `${opts.assignmentTitle} · ${opts.studentName}`,
    payload: {
      studentName: opts.studentName,
      assignmentTitle: opts.assignmentTitle,
      maxMarks: opts.maxMarks ?? null,
      ...parsed,
    },
  });

  return { ...parsed, historyId: saved.id };
}

/** Get class-level weak topic summary from recent quiz attempts. */
export async function teacherWeakTopicSummary(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
}) {
  await assertTeacherClass(opts.teacherId, opts.classId, opts.tenantId);

  const answers = await prisma.answer.findMany({
    where: {
      tenantId: opts.tenantId,
      attempt: { quiz: { classId: opts.classId }, submittedAt: { not: null } },
    },
    include: {
      question: { select: { text: true, options: true, correctIndex: true } },
      attempt: { include: { quiz: { select: { title: true, totalMarks: true } } } },
    },
    orderBy: { attempt: { submittedAt: 'desc' } },
    take: 200,
  });

  const total = answers.length;
  const wrong = answers.filter((a) => a.selectedIndex !== a.question.correctIndex);
  if (total === 0) {
    const empty = {
      summary: 'No quiz attempts found for this class yet.',
      weakTopics: [] as unknown[],
      stats: { total, wrong: 0, accuracy: null as number | null },
    };
    const saved = await saveTeacherAiHistory({
      tenantId: opts.tenantId,
      teacherId: opts.teacherId,
      classId: opts.classId,
      tool: 'weak-topics',
      title: 'Weak topic analysis (no data)',
      payload: empty,
    });
    return { ...empty, historyId: saved.id };
  }

  const accuracy = Math.round(((total - wrong.length) / total) * 100);

  const wrongTexts = wrong
    .slice(0, 40)
    .map((a) => `- ${a.question.text}`)
    .join('\n');

  const system = `You are a teaching analytics AI. Identify weak topics from quiz data. Respond with JSON only.`;
  const user = `Class has ${total} total answers, ${wrong.length} wrong (${accuracy}% accuracy).
Wrong questions (sample):
${wrongTexts || 'None'}

Identify the top weak topics. Return JSON:
{
  "summary": "Short narrative summary (2-3 sentences)",
  "weakTopics": [
    {"topic": "Topic name", "reason": "Why students struggle", "suggestion": "What to do"}
  ]
}`;

  const raw = await callAnthropic({ system, user, maxTokens: 800 });
  let result: {
    summary: string;
    weakTopics: unknown[];
    stats: { total: number; wrong: number; accuracy: number };
  };
  if (!raw) {
    result = {
      summary: `Class accuracy is ${accuracy}%. ${wrong.length} wrong answers from ${total} total.`,
      weakTopics: [],
      stats: { total, wrong: wrong.length, accuracy },
    };
  } else {
    const parsed = parseJsonObject<{ summary: string; weakTopics: unknown[] }>(raw);
    result = {
      summary: parsed?.summary ?? `Class accuracy is ${accuracy}%.`,
      weakTopics: parsed?.weakTopics ?? [],
      stats: { total, wrong: wrong.length, accuracy },
    };
  }

  const saved = await saveTeacherAiHistory({
    tenantId: opts.tenantId,
    teacherId: opts.teacherId,
    classId: opts.classId,
    tool: 'weak-topics',
    title: `Weak topics · ${result.stats.accuracy}% accuracy`,
    payload: result,
  });

  return { ...result, historyId: saved.id };
}

/** Identify which students need intervention and suggest actions. */
export async function teacherInterventionSuggestions(opts: {
  tenantId: string;
  teacherId: string;
  classId: string;
}) {
  await assertTeacherClass(opts.teacherId, opts.classId, opts.tenantId);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const enrollments = await prisma.enrollment.findMany({
    where: { classId: opts.classId, status: 'active', tenantId: opts.tenantId },
    include: { student: { select: { id: true, name: true, email: true } } },
  });

  const suggestions = await Promise.all(
    enrollments.map(async (e) => {
      const [attendance, attempts] = await Promise.all([
        prisma.attendance.findMany({
          where: { studentId: e.studentId, classId: opts.classId, sessionDate: { gte: since } },
        }),
        prisma.quizAttempt.findMany({
          where: {
            studentId: e.studentId,
            quiz: { classId: opts.classId },
            submittedAt: { not: null },
          },
          include: { quiz: { select: { totalMarks: true } } },
        }),
      ]);

      const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
      const attRate = attendance.length >= 3 ? Math.round((present / attendance.length) * 100) : null;

      const pcts = attempts
        .filter((a) => a.quiz.totalMarks > 0 && a.score != null)
        .map((a) => Math.round((a.score! / a.quiz.totalMarks) * 100));
      const quizAvg = pcts.length >= 2 ? Math.round(pcts.reduce((s, n) => s + n, 0) / pcts.length) : null;

      const flags: string[] = [];
      if (attRate !== null && attRate < 70) flags.push(`low attendance (${attRate}%)`);
      if (quizAvg !== null && quizAvg < 50) flags.push(`low quiz average (${quizAvg}%)`);

      return {
        studentId: e.student.id,
        name: e.student.name,
        email: e.student.email,
        attendanceRate: attRate,
        quizAverage: quizAvg,
        flags,
        needsIntervention: flags.length > 0,
      };
    })
  );

  const atRisk = suggestions.filter((s) => s.needsIntervention);

  if (atRisk.length === 0) {
    const empty = { suggestions: [] as unknown[], message: 'All students appear to be on track!' };
    const saved = await saveTeacherAiHistory({
      tenantId: opts.tenantId,
      teacherId: opts.teacherId,
      classId: opts.classId,
      tool: 'intervention',
      title: 'Intervention radar · all on track',
      payload: empty,
    });
    return { ...empty, historyId: saved.id };
  }

  const system = `You are a teacher assistant. Suggest specific interventions for at-risk students. Respond with JSON only.`;
  const user = `${atRisk.length} students need attention:
${atRisk.map((s) => `- ${s.name}: ${s.flags.join(', ')}`).join('\n')}

For each student, suggest one short, actionable intervention. Return JSON:
{
  "interventions": [
    {
      "studentName": "Name",
      "suggestion": "Specific action to take",
      "priority": "high|medium|low"
    }
  ]
}`;

  const raw = await callAnthropic({ system, user, maxTokens: 600 });
  const parsed = raw
    ? parseJsonObject<{
        interventions: { studentName: string; suggestion: string; priority: string }[];
      }>(raw)
    : null;

  const aiMap = new Map(parsed?.interventions?.map((i) => [i.studentName, i]) ?? []);

  const result = {
    suggestions: atRisk.map((s) => ({
      ...s,
      aiSuggestion: aiMap.get(s.name)?.suggestion ?? null,
      priority: aiMap.get(s.name)?.priority ?? 'medium',
    })),
    message: null as string | null,
  };

  const saved = await saveTeacherAiHistory({
    tenantId: opts.tenantId,
    teacherId: opts.teacherId,
    classId: opts.classId,
    tool: 'intervention',
    title: `Intervention radar · ${result.suggestions.length} at risk`,
    payload: result,
  });

  return { ...result, historyId: saved.id };
}
