import { prisma } from '../lib/prisma';
import { currentBillingMonth } from './access';
import { callAnthropic, parseJsonObject } from './anthropic';
import { badRequest, forbidden, notFound, paymentRequired } from '../utils/httpError';
import { weakTopicsForStudent } from './aiCoach';
import { assertFeature, getAiTokenLimit } from './planGates';

export const AI_TOKEN_LIMIT = 20;

export type AiToolId = 'tutor' | 'summarizer' | 'mcq' | 'flashcards' | 'study-plan';

async function getTenantForAi(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound('Institute not found');
  assertFeature(tenant, 'aiStudent');
  return tenant;
}

async function assertActiveEnrollment(studentId: string, classId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, classId, status: 'active' },
    include: { class: { select: { id: true, title: true, description: true } } },
  });
  if (!enrollment) throw forbidden('You must be enrolled in this class to use AI tools');
  return enrollment;
}

export async function listAiClasses(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: 'active' },
    include: { class: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return enrollments.map((e) => ({
    classId: e.class.id,
    title: e.class.title,
  }));
}

export async function getAiQuota(opts: { tenantId: string; studentId: string; classId: string }) {
  await assertActiveEnrollment(opts.studentId, opts.classId);
  const tenant = await getTenantForAi(opts.tenantId);
  const limit = getAiTokenLimit(tenant);
  const forMonth = currentBillingMonth();
  const row = await prisma.aiUsage.findUnique({
    where: {
      studentId_classId_forMonth: {
        studentId: opts.studentId,
        classId: opts.classId,
        forMonth,
      },
    },
  });
  const used = row?.used ?? 0;
  return {
    forMonth,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

async function requireQuotaThenRun<T>(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  run: () => Promise<T>;
}): Promise<{ result: T; quota: Awaited<ReturnType<typeof getAiQuota>> }> {
  await assertActiveEnrollment(opts.studentId, opts.classId);
  const tenant = await getTenantForAi(opts.tenantId);
  const limit = getAiTokenLimit(tenant);
  const forMonth = currentBillingMonth();

  const existing = await prisma.aiUsage.findUnique({
    where: {
      studentId_classId_forMonth: {
        studentId: opts.studentId,
        classId: opts.classId,
        forMonth,
      },
    },
  });
  if ((existing?.used ?? 0) >= limit) {
    throw paymentRequired(
      `Monthly AI token limit reached (${limit}/${limit}) for this class. Resets next month.`,
      { used: existing?.used ?? limit, limit, forMonth }
    );
  }

  // Only consume after a successful Anthropic-backed result (run must throw on failure).
  const result = await opts.run();

  await prisma.aiUsage.upsert({
    where: {
      studentId_classId_forMonth: {
        studentId: opts.studentId,
        classId: opts.classId,
        forMonth,
      },
    },
    create: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      classId: opts.classId,
      forMonth,
      used: 1,
    },
    update: { used: { increment: 1 } },
  });

  const quota = await getAiQuota(opts);
  return { result, quota };
}

export async function saveAiToolHistory(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  tool: AiToolId;
  title: string;
  payload: Record<string, unknown>;
}) {
  return prisma.aiToolHistory.create({
    data: {
      tenantId: opts.tenantId,
      studentId: opts.studentId,
      classId: opts.classId,
      tool: opts.tool,
      title: opts.title.slice(0, 180),
      payload: opts.payload,
    },
  });
}

export async function listAiToolHistory(opts: {
  studentId: string;
  classId: string;
  tool: AiToolId;
  take?: number;
}) {
  await assertActiveEnrollment(opts.studentId, opts.classId);
  const rows = await prisma.aiToolHistory.findMany({
    where: {
      studentId: opts.studentId,
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

function requireAiText(raw: string | null): string {
  if (!raw) {
    throw badRequest('AI service is unavailable right now. Try again later.');
  }
  return raw;
}

async function classContext(classId: string) {
  const klass = await prisma.class.findFirst({
    where: { id: classId },
    select: { title: true, description: true },
  });
  if (!klass) throw notFound('Class not found');
  return klass;
}

function tutorSystem(classTitle: string) {
  return `You are a supportive real-time AI tutor for the class "${classTitle}" (O/L and A/L tuition in Sri Lanka).
Explain in simple English. Be encouraging. Do not use markdown, bold markers (*), or emojis.
Reply with ONLY valid JSON in this exact shape:
{"sections":[{"heading":"short heading","paragraphs":["one or two short sentences"],"bullets":["optional list item"]}]}
Rules:
- Use 2 to 6 sections.
- Put each idea in its own paragraph or bullet — never one long wall of text.
- For lists (classes, steps, examples), use bullets.
- Keep headings short (3-6 words).
- For greetings or very short answers, one section with 1-2 paragraphs is fine.`;
}

export type TutorSection = {
  heading?: string;
  paragraphs: string[];
  bullets: string[];
};

function normalizeTutorReply(raw: string): { reply: string; sections: TutorSection[] } {
  const parsed = parseJsonObject<{
    sections?: { heading?: string; paragraphs?: unknown; bullets?: unknown }[];
  }>(raw);

  if (parsed?.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
    const sections: TutorSection[] = parsed.sections.map((s) => ({
      heading: typeof s.heading === 'string' ? s.heading.trim() : undefined,
      paragraphs: Array.isArray(s.paragraphs)
        ? s.paragraphs.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean)
        : [],
      bullets: Array.isArray(s.bullets)
        ? s.bullets.filter((b): b is string => typeof b === 'string').map((b) => b.trim()).filter(Boolean)
        : [],
    })).filter((s) => s.heading || s.paragraphs.length || s.bullets.length);

    if (sections.length) {
      const reply = sections
        .map((s) => {
          const parts = [
            s.heading ? s.heading : '',
            ...s.paragraphs,
            ...s.bullets.map((b) => `• ${b}`),
          ].filter(Boolean);
          return parts.join('\n');
        })
        .join('\n\n');
      return { reply, sections };
    }
  }

  // Plain-text fallback: break into readable chunks
  const cleaned = raw
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
  const chunks = cleaned
    .split(/\n{2,}|\r\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  const sections: TutorSection[] =
    chunks.length > 1
      ? chunks.map((c) => {
          const lines = c.split(/\n/).map((l) => l.trim()).filter(Boolean);
          const bullets = lines.filter((l) => /^[-•*]\s+|^\d+[\).]\s+/.test(l));
          const paragraphs = lines.filter((l) => !/^[-•*]\s+|^\d+[\).]\s+/.test(l));
          return {
            paragraphs: paragraphs.length ? paragraphs : [c],
            bullets: bullets.map((b) => b.replace(/^[-•*]\s+|^\d+[\).]\s+/, '')),
          };
        })
      : [
          {
            paragraphs: cleaned
              .split(/(?<=[.!?])\s+(?=[A-Z])/)
              .map((p) => p.trim())
              .filter((p) => p.length > 0)
              .reduce<string[]>((acc, sentence, i) => {
                if (i % 2 === 0) acc.push(sentence);
                else acc[acc.length - 1] = `${acc[acc.length - 1]} ${sentence}`;
                return acc;
              }, []),
            bullets: [],
          },
        ];

  return { reply: cleaned, sections };
}

export async function aiTutorChat(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}) {
  const message = opts.message.trim();
  if (!message) throw badRequest('Message is required');
  if (message.length > 4000) throw badRequest('Message is too long');

  const klass = await classContext(opts.classId);
  const history = (opts.history ?? []).slice(-8);
  const historyBlock = history
    .map((h) => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.content}`)
    .join('\n');

  const { result, quota } = await requireQuotaThenRun({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    run: async () => {
      const raw = requireAiText(
        await callAnthropic({
          system: tutorSystem(klass.title),
          user: `${historyBlock ? `Recent chat:\n${historyBlock}\n\n` : ''}Student: ${message}`,
          maxTokens: 1200,
        })
      );
      const normalized = normalizeTutorReply(raw);
      return { ...normalized, provider: 'anthropic' as const };
    },
  });

  const saved = await saveAiToolHistory({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    tool: 'tutor',
    title: message.length > 80 ? `${message.slice(0, 77)}…` : message,
    payload: { message, reply: result.reply, sections: result.sections },
  });

  return { ...result, quota, historyId: saved.id };
}

export async function aiSummarize(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  notes: string;
}) {
  const notes = opts.notes.trim();
  if (notes.length < 40) throw badRequest('Paste at least a short paragraph to summarize');
  if (notes.length > 12000) throw badRequest('Notes are too long (max ~12,000 characters)');

  const klass = await classContext(opts.classId);

  const { result, quota } = await requireQuotaThenRun({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    run: async () => {
      const raw = requireAiText(
        await callAnthropic({
          system: `You summarize study notes for class "${klass.title}".
Reply with ONLY valid JSON:
{"title":"short title","keyPoints":["point1","point2"],"summary":"2-4 sentence overview","remember":["memory tip 1"]}
No markdown. 4 to 8 keyPoints.`,
          user: `Notes to summarize:\n\n${notes}`,
          maxTokens: 900,
        })
      );
      const parsed = parseJsonObject<{
        title?: string;
        keyPoints?: string[];
        summary?: string;
        remember?: string[];
      }>(raw);
      if (!parsed) throw badRequest('AI returned an unexpected summary format. Please try again.');
      return {
        title: parsed.title || 'Summary',
        keyPoints: Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.filter((x) => typeof x === 'string')
          : [],
        summary: parsed.summary || '',
        remember: Array.isArray(parsed.remember)
          ? parsed.remember.filter((x) => typeof x === 'string')
          : [],
        provider: 'anthropic' as const,
      };
    },
  });

  const saved = await saveAiToolHistory({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    tool: 'summarizer',
    title: result.title,
    payload: {
      notesPreview: notes.slice(0, 280),
      title: result.title,
      keyPoints: result.keyPoints,
      summary: result.summary,
      remember: result.remember,
    },
  });

  return { ...result, quota, historyId: saved.id };
}

export async function aiGenerateMcq(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  topic?: string;
}) {
  const klass = await classContext(opts.classId);
  const topic = (opts.topic || klass.title).trim().slice(0, 200);

  const { result, quota } = await requireQuotaThenRun({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    run: async () => {
      const raw = requireAiText(
        await callAnthropic({
          system: `You create one multiple-choice question for class "${klass.title}".
Reply with ONLY valid JSON:
{"question":"...","options":["A","B","C","D"],"correctIndex":0,"hint":"short hint after answer"}
correctIndex is 0-3. No markdown.`,
          user: `Topic focus: ${topic}`,
          maxTokens: 500,
        })
      );
      const parsed = parseJsonObject<{
        question?: string;
        options?: string[];
        correctIndex?: number;
        hint?: string;
      }>(raw);
      if (
        !parsed?.question ||
        !Array.isArray(parsed.options) ||
        parsed.options.length !== 4 ||
        typeof parsed.correctIndex !== 'number' ||
        parsed.correctIndex < 0 ||
        parsed.correctIndex > 3
      ) {
        throw badRequest('AI returned an unexpected question format. Please try again.');
      }
      return {
        question: parsed.question,
        options: parsed.options.map(String),
        correctIndex: parsed.correctIndex,
        hint: parsed.hint || 'Review the related concept in your notes.',
        provider: 'anthropic' as const,
      };
    },
  });

  const saved = await saveAiToolHistory({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    tool: 'mcq',
    title: result.question.length > 100 ? `${result.question.slice(0, 97)}…` : result.question,
    payload: {
      topic,
      question: result.question,
      options: result.options,
      correctIndex: result.correctIndex,
      hint: result.hint,
    },
  });

  return { ...result, quota, historyId: saved.id };
}

export async function aiFlashcards(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  topicOrNotes: string;
}) {
  const input = opts.topicOrNotes.trim();
  if (input.length < 8) throw badRequest('Enter a topic or paste notes for flashcards');
  if (input.length > 8000) throw badRequest('Input is too long');

  const klass = await classContext(opts.classId);

  const { result, quota } = await requireQuotaThenRun({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    run: async () => {
      const raw = requireAiText(
        await callAnthropic({
          system: `Create revision flashcards for class "${klass.title}".
Reply with ONLY valid JSON:
{"cards":[{"front":"question or term","back":"short answer"}]}
Make 5 to 8 cards. No markdown.`,
          user: input,
          maxTokens: 900,
        })
      );
      const parsed = parseJsonObject<{ cards?: { front?: string; back?: string }[] }>(raw);
      const cards =
        parsed?.cards
          ?.filter((c) => c.front && c.back)
          .map((c) => ({ front: String(c.front), back: String(c.back) }))
          .slice(0, 8) ?? [];
      if (!cards.length) throw badRequest('AI returned no flashcards. Please try again.');
      return { cards, provider: 'anthropic' as const };
    },
  });

  const saved = await saveAiToolHistory({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    tool: 'flashcards',
    title: input.length > 80 ? `${input.slice(0, 77)}…` : input,
    payload: { topicOrNotes: input.slice(0, 500), cards: result.cards },
  });

  return { ...result, quota, historyId: saved.id };
}

export async function aiStudyPlan(opts: {
  tenantId: string;
  studentId: string;
  classId: string;
  subject: string;
  unit: string;
  topic: string;
}) {
  const subject = opts.subject.trim();
  const unit = opts.unit.trim();
  const topic = opts.topic.trim();
  if (subject.length < 2) throw badRequest('Subject is required');
  if (unit.length < 1) throw badRequest('Unit is required');
  if (topic.length < 2) throw badRequest('Topic is required');
  if (subject.length > 120 || unit.length > 120 || topic.length > 200) {
    throw badRequest('Subject, unit, or topic is too long');
  }

  const klass = await classContext(opts.classId);
  const weak = await weakTopicsForStudent({ studentId: opts.studentId, classId: opts.classId });

  const { result, quota } = await requireQuotaThenRun({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    run: async () => {
      const weakTerms = weak.weakTopics.map((t) => t.term).slice(0, 6);
      const raw = requireAiText(
        await callAnthropic({
          system: `You create a practical 7-day study plan for class "${klass.title}".
Focus ONLY on the student's chosen subject, unit, and topic. Do not invent unrelated chapters.
Reply with ONLY valid JSON:
{"focus":"one sentence","days":[{"day":"Day 1","task":"...","minutes":30}]}
Exactly 7 days. No markdown. Keep tasks concrete and short, tied to the given topic.`,
          user: `Class: ${klass.title}
Subject: ${subject}
Unit: ${unit}
Topic: ${topic}
Optional quiz weak signals (use only if relevant to this topic): ${weakTerms.join(', ') || 'none'}`,
          maxTokens: 800,
        })
      );
      const parsed = parseJsonObject<{
        focus?: string;
        days?: { day?: string; task?: string; minutes?: number }[];
      }>(raw);
      const days =
        parsed?.days
          ?.filter((d) => d.day && d.task)
          .map((d) => ({
            day: String(d.day),
            task: String(d.task),
            minutes: typeof d.minutes === 'number' ? d.minutes : 30,
          }))
          .slice(0, 7) ?? [];

      if (days.length < 5) {
        throw badRequest('AI returned an incomplete study plan. Please try again.');
      }

      return {
        focus: parsed?.focus || `Study plan: ${subject} — ${topic}`,
        days,
        subject,
        unit,
        topic,
        weakTopics: weakTerms,
        provider: 'anthropic' as const,
      };
    },
  });

  const saved = await saveAiToolHistory({
    tenantId: opts.tenantId,
    studentId: opts.studentId,
    classId: opts.classId,
    tool: 'study-plan',
    title: `${subject} · ${unit} · ${topic}`,
    payload: {
      subject: result.subject,
      unit: result.unit,
      topic: result.topic,
      focus: result.focus,
      days: result.days,
      weakTopics: result.weakTopics,
    },
  });

  return { ...result, quota, historyId: saved.id };
}
