import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../utils/httpError';

function ruleBasedExplain(opts: {
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
}) {
  const correct = opts.options[opts.correctIndex] ?? '';
  const selected =
    opts.selectedIndex != null && opts.selectedIndex >= 0
      ? opts.options[opts.selectedIndex]
      : null;
  const gotIt = opts.selectedIndex === opts.correctIndex;

  if (gotIt) {
    const steps = [
      `"${correct}" is the correct answer.`,
      `It best matches the question: "${opts.question}".`,
      'Rewrite this question in your own words to lock in the idea.',
    ];
    return { provider: 'rules' as const, explanation: steps.join(' '), steps };
  }

  const steps = [
    `The correct answer is "${correct}".`,
    selected
      ? `You chose "${selected}", which doesn't match the required concept.`
      : 'You left this unanswered.',
    'Re-read the question, eliminate options that contradict key terms, then compare what remains to your class notes.',
    `Write one sentence explaining why "${correct}" is right and why the other options are wrong.`,
  ];
  return { provider: 'rules' as const, explanation: steps.join(' '), steps };
}

const TUTOR_SYSTEM = `You are a supportive tuition tutor for O/L and A/L students in Sri Lanka.
Explain quiz answers in simple English. Be encouraging. Do not use markdown, bold, headings, or emojis.
Reply with ONLY valid JSON in this exact shape:
{"steps":["step 1 text","step 2 text","step 3 text","step 4 text"]}
Use 3 to 5 short steps. Each step is one clear sentence (or two short sentences max).
Typical flow: key rule → apply to this question → why the correct option works → why the student's choice was wrong (if wrong) → one memory tip.`;

function parseStepsFromAi(raw: string): string[] | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { steps?: unknown };
    if (!Array.isArray(parsed.steps)) return null;
    const steps = parsed.steps
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim())
      .filter(Boolean);
    return steps.length ? steps : null;
  } catch {
    return null;
  }
}

/** Fallback: split plain text into readable steps when JSON is missing. */
function fallbackStepsFromText(text: string): string[] {
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/💪/g, '')
    .trim();

  const numbered = cleaned
    .split(/\n+/)
    .map((l) => l.replace(/^\d+[\).:\-]\s*/, '').trim())
    .filter(Boolean);

  if (numbered.length >= 2) return numbered;

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (sentences.length >= 2) return sentences.slice(0, 5);

  return [cleaned];
}

async function explainWithAnthropic(prompt: string): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: TUTOR_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === 'text')?.text;
    return text?.trim() || null;
  } catch {
    return null;
  }
}

async function explainWithOpenAI(prompt: string): Promise<string | null> {
  if (!env.openaiApiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: TUTOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function explainWithGemini(prompt: string): Promise<string | null> {
  if (!env.geminiApiKey) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${TUTOR_SYSTEM}\n\n${prompt}` }] }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function explainQuizQuestion(opts: {
  attemptId: string;
  questionId: string;
  userId: string;
  role: string;
}) {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: opts.attemptId },
    include: {
      quiz: { include: { questions: true } },
      answers: true,
    },
  });
  if (!attempt) throw notFound('Attempt not found');
  if (opts.role === 'student' && attempt.studentId !== opts.userId) {
    throw forbidden('Not your attempt');
  }
  if (!attempt.submittedAt) throw forbidden('Submit the quiz before asking for explanations');

  const question = attempt.quiz.questions.find((q) => q.id === opts.questionId);
  if (!question) throw notFound('Question not found');

  const options = Array.isArray(question.options)
    ? (question.options as string[])
    : (JSON.parse(JSON.stringify(question.options)) as string[]);
  const answer = attempt.answers.find((a) => a.questionId === question.id);
  const selectedIndex = answer?.selectedIndex ?? null;

  // Return persisted explanation — no second AI call.
  if (answer?.explanation) {
    const steps = Array.isArray(answer.explanationSteps)
      ? (answer.explanationSteps as string[]).filter((s) => typeof s === 'string')
      : [answer.explanation];
    return {
      provider: 'saved' as const,
      explanation: answer.explanation,
      steps: steps.length ? steps : [answer.explanation],
      questionId: question.id,
      correctIndex: question.correctIndex,
      selectedIndex,
      alreadyExplained: true,
    };
  }

  const prompt = `Question: ${question.text}
Options:
${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}
Correct option number: ${question.correctIndex + 1}
Student selected: ${selectedIndex != null ? selectedIndex + 1 : 'none'}
Return JSON steps that teach this concept step by step.`;

  let provider: 'anthropic' | 'openai' | 'gemini' | 'rules' = 'rules';
  let steps: string[] = [];

  const anthropicRaw = await explainWithAnthropic(prompt);
  const openaiRaw = anthropicRaw ? null : await explainWithOpenAI(prompt);
  const geminiRaw = anthropicRaw || openaiRaw ? null : await explainWithGemini(prompt);
  const raw = anthropicRaw || openaiRaw || geminiRaw;

  if (raw) {
    provider = anthropicRaw ? 'anthropic' : openaiRaw ? 'openai' : 'gemini';
    steps = parseStepsFromAi(raw) ?? fallbackStepsFromText(raw);
  } else {
    const fallback = ruleBasedExplain({
      question: question.text,
      options,
      correctIndex: question.correctIndex,
      selectedIndex,
    });
    provider = 'rules';
    steps = fallback.steps;
  }

  const explanation = steps.join(' ');

  if (answer) {
    await prisma.answer.update({
      where: { id: answer.id },
      data: { explanation, explanationSteps: steps },
    });
  }

  return {
    provider,
    explanation,
    steps,
    questionId: question.id,
    correctIndex: question.correctIndex,
    selectedIndex,
    alreadyExplained: false,
  };
}

export async function weakTopicsForStudent(opts: { studentId: string; classId?: string }) {
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      studentId: opts.studentId,
      submittedAt: { not: null },
      ...(opts.classId ? { quiz: { classId: opts.classId } } : {}),
    },
    include: {
      quiz: { select: { id: true, title: true, classId: true, totalMarks: true } },
      answers: { include: { question: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 20,
  });

  const wrong: { quizTitle: string; question: string; correct: string }[] = [];
  for (const att of attempts) {
    for (const a of att.answers) {
      if (a.selectedIndex !== a.question.correctIndex) {
        const options = a.question.options as string[];
        wrong.push({
          quizTitle: att.quiz.title,
          question: a.question.text,
          correct: options[a.question.correctIndex] ?? '',
        });
      }
    }
  }

  const keywords = new Map<string, number>();
  for (const w of wrong) {
    const tokens = w.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 4);
    for (const t of tokens.slice(0, 6)) {
      keywords.set(t, (keywords.get(t) ?? 0) + 1);
    }
  }

  const topTopics = [...keywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, missCount: count }));

  return {
    wrongCount: wrong.length,
    recentMisses: wrong.slice(0, 10),
    weakTopics: topTopics,
    summary:
      topTopics.length > 0
        ? `You missed questions involving: ${topTopics
            .slice(0, 5)
            .map((t) => t.term)
            .join(', ')}. Revisit class notes on these ideas and retry similar MCQs.`
        : 'Not enough wrong answers yet to spot weak topics. Keep practising!',
  };
}
