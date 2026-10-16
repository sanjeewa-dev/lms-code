/**
 * Mindspark LMS write-path load test.
 *
 * Ramps concurrent writers: 10 → 50 → 100 → 500 → 1000 → 2000 → 3000.
 * Mix: quiz start/submit, student uploads, teacher material uploads,
 * chat, attendance, profile writes, and AI routes.
 *
 * Usage:
 *   node scripts/write-load-test.mjs
 *
 * Set API_RATE_LIMIT_MAX=0 and AUTH_RATE_LIMIT_MAX=0, then restart the API.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const require = createRequire(import.meta.url);
  const { Agent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(
    new Agent({
      connections: 4000,
      pipelining: 1,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    }),
  );
} catch {
  // Native fetch keeps its default pool if undici is not resolvable.
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE = arg('base', process.env.LMS_API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const SLUG = arg('slug', process.env.LMS_TENANT_SLUG ?? 'ictpasidu');
const PASSWORD = arg('password', process.env.LMS_LOADTEST_PASSWORD ?? '1234');
const TEACHER_EMAIL = arg('teacher', process.env.LMS_TEACHER_EMAIL ?? 'teacher@ictpasidu.lms');
const OUT_PATH = resolve(__dirname, '..', 'scripts', 'write-load-test-results.json');
const REQUEST_TIMEOUT_MS = 30_000;

const STUDENT_EMAILS = [
  'student@ictpasidu.lms',
  'sanjeewa@ictpasidu.lms',
  'chathuranga@ictpasidu.lms',
  'nimali@ictpasidu.lms',
  'kasun@ictpasidu.lms',
  'ishara@ictpasidu.lms',
  'tharindu@ictpasidu.lms',
];

const ALL_STAGES = [
  { name: 'vu10', vu: 10, durationSec: 12 },
  { name: 'vu50', vu: 50, durationSec: 12 },
  { name: 'vu100', vu: 100, durationSec: 12 },
  { name: 'vu500', vu: 500, durationSec: 10 },
  { name: 'vu1000', vu: 1000, durationSec: 8 },
  { name: 'vu2000', vu: 2000, durationSec: 8 },
  { name: 'vu3000', vu: 3000, durationSec: 8 },
];
const only = arg('only', '');
const STAGES = only
  ? ALL_STAGES.filter((s) => s.name === only || String(s.vu) === only)
  : ALL_STAGES;
if (!STAGES.length) {
  throw new Error(`No stages match --only ${only}`);
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const NOTES =
  'Hardware, software and firmware work together in a computer system. ' +
  'The CPU fetches instructions from memory and the operating system schedules processes.';

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function classify(sample) {
  if (sample.ok) return 'ok';
  if (sample.status === 409) return 'conflict';
  if (sample.aiUnavailable) return 'ai_unavailable';
  if (sample.status >= 500) return 'server';
  if (sample.status >= 400) return 'client';
  return sample.error || 'network';
}

function summarize(samples) {
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.ok);
  const failed = samples.filter((s) => !s.ok);
  const statuses = {};
  const classes = {};
  for (const s of samples) {
    const key = s.status === 0 ? `error:${s.error || 'network'}` : String(s.status);
    statuses[key] = (statuses[key] || 0) + 1;
    const cls = classify(s);
    classes[cls] = (classes[cls] || 0) + 1;
  }
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    requests: samples.length,
    ok: ok.length,
    failed: failed.length,
    errorRatePct: samples.length ? Number(((failed.length / samples.length) * 100).toFixed(2)) : 0,
    successRatePct: samples.length ? Number(((ok.length / samples.length) * 100).toFixed(2)) : 0,
    latencyMs: {
      min: latencies[0] ?? 0,
      mean: latencies.length ? Number((sum / latencies.length).toFixed(1)) : 0,
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: latencies[latencies.length - 1] ?? 0,
    },
    statuses,
    classes,
  };
}

function summarizeByEndpoint(samples) {
  const groups = new Map();
  for (const s of samples) {
    if (!groups.has(s.name)) groups.set(s.name, []);
    groups.get(s.name).push(s);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, ...summarize(list) }))
    .sort((a, b) => b.latencyMs.p95 - a.latencyMs.p95);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, tenantSlug: SLUG }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(body)}`);
  }
  return { accessToken: body.accessToken, user: body.user };
}

async function api(method, path, token, { json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json ? JSON.stringify(json) : form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body };
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function pngForm(extraFields = {}) {
  const form = new FormData();
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'loadtest.png');
  for (const [key, value] of Object.entries(extraFields)) form.append(key, String(value));
  return form;
}

function catalogForStage(ctx) {
  const uploadWeight = ctx.vu >= 500 ? 3 : 8;
  return [
    { name: 'quiz_start_submit', weight: 22 },
    { name: 'student_upload', weight: uploadWeight },
    { name: 'teacher_material_upload', weight: Math.max(2, uploadWeight - 2) },
    { name: 'teacher_assessment_write', weight: 8 },
    { name: 'chat_message', weight: 16 },
    { name: 'attendance_upsert', weight: 10 },
    { name: 'profile_patch', weight: 8 },
    { name: 'notification_read_all', weight: 6 },
    { name: 'ai_tutor', weight: 6 },
    { name: 'ai_flashcards', weight: 4 },
    { name: 'ai_mcq', weight: 4 },
    { name: 'ai_quota', weight: 4 },
    { name: 'ai_teacher_feedback', weight: 4 },
    { name: 'ai_teacher_quiz_gen', weight: 3 },
    { name: 'ai_teacher_weak_topics', weight: 3 },
  ];
}

async function runAction(name, ctx) {
  const student = ctx.students[ctx.nextStudent++ % ctx.students.length];
  const quiz = ctx.quizzes[ctx.nextQuiz++ % ctx.quizzes.length];

  switch (name) {
    case 'quiz_start_submit': {
      const started = await api('POST', `/api/t/${SLUG}/quizzes/${quiz.id}/attempts`, student.accessToken, {
        json: {},
      });
      if (!started.ok) return { status: started.status, ok: started.ok, body: started.body };
      const attemptId = started.body?.attempt?.id;
      const questions = started.body?.quiz?.questions ?? [];
      const answers = questions.map((q, i) => ({
        questionId: q.id,
        selectedIndex: i === 0 ? 1 : 0,
      }));
      const submitted = await api('POST', `/api/t/${SLUG}/attempts/${attemptId}/submit`, student.accessToken, {
        json: { answers },
      });
      return { status: submitted.status, ok: submitted.ok, body: submitted.body };
    }
    case 'student_upload': {
      const form = pngForm();
      if (ctx.assessmentId) form.append('assessmentId', ctx.assessmentId);
      return api('POST', `/api/t/${SLUG}/classes/${ctx.classId}/submissions`, student.accessToken, { form });
    }
    case 'teacher_material_upload': {
      return api('POST', `/api/t/${SLUG}/classes/${ctx.classId}/materials`, ctx.teacherToken, {
        form: pngForm({
          title: `LT material ${Date.now()}`,
          kind: 'material',
          published: 'true',
        }),
      });
    }
    case 'teacher_assessment_write': {
      const form = new FormData();
      form.append('title', `LT assessment ${Date.now()}`);
      form.append('kind', 'assessment');
      form.append('maxMarks', '10');
      form.append('published', 'true');
      return api('POST', `/api/t/${SLUG}/classes/${ctx.classId}/materials`, ctx.teacherToken, { form });
    }
    case 'chat_message': {
      return api('POST', `/api/t/${SLUG}/chat/conversations/${ctx.conversationId}/messages`, student.accessToken, {
        json: { body: `load-test ping ${Date.now()}` },
      });
    }
    case 'attendance_upsert': {
      return api('POST', `/api/t/${SLUG}/classes/${ctx.classId}/attendance`, ctx.teacherToken, {
        json: {
          sessionDate: ctx.sessionDate,
          records: [{ studentId: student.user.id, status: 'present' }],
        },
      });
    }
    case 'profile_patch': {
      return api('PATCH', `/api/t/${SLUG}/profile`, student.accessToken, {
        json: { address: `Load test ${ctx.stage} ${Date.now()}` },
      });
    }
    case 'notification_read_all': {
      return api('POST', `/api/t/${SLUG}/notifications/read-all`, student.accessToken, { json: {} });
    }
    case 'ai_tutor': {
      return api('POST', `/api/t/${SLUG}/ai/tutor`, student.accessToken, {
        json: { classId: ctx.classId, message: 'Explain what RAM is used for in one short paragraph.' },
      });
    }
    case 'ai_flashcards': {
      return api('POST', `/api/t/${SLUG}/ai/flashcards`, student.accessToken, {
        json: { classId: ctx.classId, topicOrNotes: 'CPU registers, cache, and main memory' },
      });
    }
    case 'ai_mcq': {
      return api('POST', `/api/t/${SLUG}/ai/mcq`, student.accessToken, {
        json: { classId: ctx.classId, topic: 'Number Systems' },
      });
    }
    case 'ai_quota': {
      return api('GET', `/api/t/${SLUG}/ai/quota?classId=${ctx.classId}`, student.accessToken);
    }
    case 'ai_teacher_feedback': {
      return api('POST', `/api/t/${SLUG}/ai-teacher/draft-feedback`, ctx.teacherToken, {
        json: {
          classId: ctx.classId,
          studentName: student.user.name,
          assignmentTitle: 'Load test assignment',
          submissionText: NOTES,
          maxMarks: 20,
        },
      });
    }
    case 'ai_teacher_quiz_gen': {
      return api('POST', `/api/t/${SLUG}/ai-teacher/generate-quiz`, ctx.teacherToken, {
        json: { classId: ctx.classId, topic: 'Logic Gates', count: 3, difficulty: 'easy' },
      });
    }
    case 'ai_teacher_weak_topics': {
      return api('GET', `/api/t/${SLUG}/ai-teacher/weak-topics/${ctx.classId}`, ctx.teacherToken);
    }
    default:
      return { ok: false, status: 0, body: { error: 'unknown action' } };
  }
}

function isAiUnavailable(body) {
  const msg = `${body?.error ?? body?.message ?? ''}`.toLowerCase();
  return msg.includes('ai service is unavailable') || msg.includes('ai');
}

async function timedAction(name, ctx) {
  const started = performance.now();
  try {
    const result = await runAction(name, ctx);
    const aiUnavailable =
      !result.ok &&
      (name.startsWith('ai_') && name !== 'ai_quota' && name !== 'ai_teacher_weak_topics') &&
      isAiUnavailable(result.body);
    return {
      name,
      status: result.status,
      ok: result.ok,
      aiUnavailable,
      error: result.ok ? undefined : `http_${result.status}`,
      ms: performance.now() - started,
    };
  } catch (err) {
    return {
      name,
      status: 0,
      ok: false,
      error: err?.name === 'TimeoutError' ? 'timeout' : err?.name || 'network',
      ms: performance.now() - started,
    };
  }
}

async function createQuiz(teacherToken, classId, label) {
  const res = await api('POST', `/api/t/${SLUG}/classes/${classId}/quizzes`, teacherToken, {
    json: {
      title: `Write-load ${label}`,
      description: 'Temporary quiz for write-path load test',
      timeLimitSec: 0,
      isPublished: true,
      questions: [
        {
          text: 'What is 2 + 2?',
          options: ['3', '4', '5', '6'],
          correctIndex: 1,
          marks: 1,
          topic: 'General',
        },
      ],
    },
  });
  if (!res.ok || !res.body?.quiz?.id) {
    throw new Error(`Quiz create failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.quiz.id, title: res.body.quiz.title };
}

async function runStage(stage, ctx) {
  const samples = [];
  const stopAt = Date.now() + stage.durationSec * 1000;
  const items = catalogForStage(stage);
  const workers = Array.from({ length: stage.vu }, async () => {
    while (Date.now() < stopAt) {
      const item = pickWeighted(items);
      samples.push(await timedAction(item.name, ctx));
    }
  });
  await Promise.all(workers);
  const summary = summarize(samples);
  return {
    ...stage,
    rps: Number((summary.requests / stage.durationSec).toFixed(1)),
    ...summary,
    byEndpoint: summarizeByEndpoint(samples),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Write-path load test  ${BASE}  tenant ${SLUG}`);

  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error(`API health check failed: ${health.status}`);

  const teacher = await login(TEACHER_EMAIL);
  const students = [];
  for (const email of STUDENT_EMAILS) {
    students.push(await login(email));
    console.log(`  logged in ${email}`);
  }

  const classesRes = await api('GET', `/api/t/${SLUG}/classes`, teacher.accessToken);
  const klass = (classesRes.body?.classes ?? []).find((c) => c.title === 'Grade 11 ICT')
    ?? classesRes.body?.classes?.[0];
  if (!klass?.id) throw new Error('No class found for teacher');

  const materialsRes = await api('GET', `/api/t/${SLUG}/classes/${klass.id}/materials`, teacher.accessToken);
  const assessment = (materialsRes.body?.materials ?? []).find((m) => m.kind === 'assessment');

  const convo = await api('POST', `/api/t/${SLUG}/chat/conversations`, students[0].accessToken, {
    json: { peerId: teacher.user.id },
  });
  const conversationId = convo.body?.conversation?.id;
  if (!conversationId) throw new Error(`Could not open chat: ${JSON.stringify(convo.body)}`);

  const quizzes = [];
  for (let i = 0; i < 8; i += 1) {
    quizzes.push(await createQuiz(teacher.accessToken, klass.id, `setup-${i + 1}`));
  }
  console.log(`Ready: class=${klass.id} students=${students.length} quizzes=${quizzes.length}`);

  const ctx = {
    teacherToken: teacher.accessToken,
    students,
    classId: klass.id,
    assessmentId: assessment?.id ?? '',
    conversationId,
    quizzes,
    sessionDate: new Date().toISOString().slice(0, 10),
    nextStudent: 0,
    nextQuiz: 0,
    stage: '',
    vu: 0,
  };

  const stages = [];
  for (const stage of STAGES) {
    ctx.stage = stage.name;
    ctx.vu = stage.vu;
    try {
      ctx.quizzes.push(await createQuiz(teacher.accessToken, klass.id, stage.name));
    } catch (err) {
      console.warn(`  quiz create skipped: ${err.message}`);
    }
    console.log(`\n>> ${stage.name}: ${stage.vu} VU for ${stage.durationSec}s`);
    const result = await runStage(stage, ctx);
    stages.push(result);
    console.log(
      `   ${result.requests} req  ${result.rps} rps  p50=${result.latencyMs.p50}ms  p95=${result.latencyMs.p95}ms  ok=${result.successRatePct}%  errors=${result.errorRatePct}%`,
    );
    console.log(`   classes=${JSON.stringify(result.classes)}`);
    persistReport(startedAt, klass, students, ctx, stages);
    await new Promise((r) => setTimeout(r, 2000));
  }

  persistReport(startedAt, klass, students, ctx, stages);
  console.log(`\nWrote ${OUT_PATH}`);
  process.exit(0);
}

function persistReport(startedAt, klass, students, ctx, stages) {
  const endpointNames = [...new Set(stages.flatMap((s) => s.byEndpoint.map((e) => e.name)))];
  const endpointRamp = endpointNames.map((name) => ({
    name,
    stages: stages.map((s) => {
      const row = s.byEndpoint.find((e) => e.name === name);
      return {
        stage: s.name,
        vu: s.vu,
        requests: row?.requests ?? 0,
        p50: row?.latencyMs.p50 ?? 0,
        p95: row?.latencyMs.p95 ?? 0,
        p99: row?.latencyMs.p99 ?? 0,
        errorRatePct: row?.errorRatePct ?? 0,
        successRatePct: row?.successRatePct ?? 0,
        classes: row?.classes ?? {},
      };
    }),
  }));
  const report = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      base: BASE,
      tenant: SLUG,
      classId: klass.id,
      studentPool: students.length,
      quizzesCreated: ctx.quizzes.length,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      notes: [
        'Write mix: quiz start/submit, uploads, chat, attendance, profile, notifications, AI routes.',
        'Quiz submit is one attempt per student per quiz; extra VUs return 409 conflict.',
        'ANTHROPIC_API_KEY is unset locally, so AI POSTs are expected to return 400 unavailable.',
        'Uploads use a 1x1 PNG. Weight drops at 500+ VU to limit disk growth.',
        'API and login rate limits were disabled for this run.',
      ],
    },
    stages,
    endpointRamp,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
