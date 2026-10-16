/**
 * Mindspark LMS ramping load test.
 *
 * Measures latency, throughput, and error rate as concurrency increases.
 * Reuses one teacher + one student access token (does not hammer /login).
 *
 * Usage:
 *   node scripts/load-test.mjs
 *   node scripts/load-test.mjs --base http://localhost:4000 --slug ictpasidu
 *
 * Raise or disable the API rate limit first, e.g. API_RATE_LIMIT_MAX=0
 * in backend/.env, then restart the API. Restore the cap after the run.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE = arg('base', process.env.LMS_API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const SLUG = arg('slug', process.env.LMS_TENANT_SLUG ?? 'ictpasidu');
const PASSWORD = arg('password', process.env.LMS_LOADTEST_PASSWORD ?? '1234');
const TEACHER_EMAIL = arg('teacher', process.env.LMS_TEACHER_EMAIL ?? 'teacher@ictpasidu.lms');
const STUDENT_EMAIL = arg('student', process.env.LMS_STUDENT_EMAIL ?? 'student@ictpasidu.lms');
const OUT_PATH = resolve(__dirname, '..', 'scripts', 'load-test-results.json');
const REQUEST_TIMEOUT_MS = 20_000;

const STAGES = [
  { name: 'warmup', vu: 1, durationSec: 8 },
  { name: 'light', vu: 5, durationSec: 12 },
  { name: 'moderate', vu: 10, durationSec: 12 },
  { name: 'heavy', vu: 25, durationSec: 15 },
  { name: 'peak', vu: 50, durationSec: 15 },
  { name: 'max', vu: 80, durationSec: 15 },
  { name: 'stress', vu: 120, durationSec: 15 },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.ok);
  const failed = samples.filter((s) => !s.ok);
  const statuses = {};
  const errors = {};
  for (const s of samples) {
    const key = s.status === 0 ? `error:${s.error || 'network'}` : String(s.status);
    statuses[key] = (statuses[key] || 0) + 1;
    if (!s.ok) {
      const ek = s.error || `http_${s.status}`;
      errors[ek] = (errors[ek] || 0) + 1;
    }
  }
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    requests: samples.length,
    ok: ok.length,
    failed: failed.length,
    errorRatePct: samples.length ? Number(((failed.length / samples.length) * 100).toFixed(2)) : 0,
    latencyMs: {
      min: latencies[0] ?? 0,
      mean: latencies.length ? Number((sum / latencies.length).toFixed(1)) : 0,
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: latencies[latencies.length - 1] ?? 0,
    },
    statuses,
    errors,
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
  return { accessToken: body.accessToken, user: body.user, tenant: body.tenant };
}

async function requestJson(path, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await res.json().catch(() => ({}));
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

async function timedRequest(item, tokens) {
  const token = item.role === 'public' ? null : tokens[item.role];
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${item.path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await res.arrayBuffer();
    return {
      name: item.name,
      role: item.role,
      path: item.path,
      status: res.status,
      ok: res.ok,
      ms: performance.now() - started,
    };
  } catch (err) {
    return {
      name: item.name,
      role: item.role,
      path: item.path,
      status: 0,
      ok: false,
      error: err?.name === 'TimeoutError' ? 'timeout' : err?.name || 'network',
      ms: performance.now() - started,
    };
  }
}

async function runStage(stage, catalog, tokens) {
  const samples = [];
  const stopAt = Date.now() + stage.durationSec * 1000;
  const workers = Array.from({ length: stage.vu }, async () => {
    while (Date.now() < stopAt) {
      const item = pickWeighted(catalog);
      samples.push(await timedRequest(item, tokens));
    }
  });
  await Promise.all(workers);
  const summary = summarize(samples);
  const elapsedSec = stage.durationSec;
  return {
    ...stage,
    rps: Number((summary.requests / elapsedSec).toFixed(1)),
    ...summary,
    byEndpoint: summarizeByEndpoint(samples),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Target ${BASE}  tenant ${SLUG}`);

  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error(`API health check failed: ${health.status}`);

  const teacher = await login(TEACHER_EMAIL);
  const student = await login(STUDENT_EMAIL);
  console.log(`Logged in teacher=${teacher.user?.role} student=${student.user?.role}`);

  const classesRes = await requestJson(`/api/t/${SLUG}/classes`, teacher.accessToken);
  const classId = classesRes.body?.classes?.[0]?.id ?? '';

  const catalog = [
    { name: 'health', role: 'public', path: '/api/health', weight: 8 },
    { name: 'public_landing', role: 'public', path: `/api/t/${SLUG}/public`, weight: 10 },
    { name: 'teacher_stats', role: 'teacher', path: `/api/t/${SLUG}/stats`, weight: 14 },
    { name: 'teacher_classes', role: 'teacher', path: `/api/t/${SLUG}/classes`, weight: 12 },
    { name: 'quiz_analytics_dashboard', role: 'teacher', path: `/api/t/${SLUG}/quiz-analytics`, weight: 10 },
    { name: 'quiz_analytics_classes', role: 'teacher', path: `/api/t/${SLUG}/quiz-analytics/classes`, weight: 8 },
    { name: 'quiz_analytics_quizzes', role: 'teacher', path: `/api/t/${SLUG}/quiz-analytics/quizzes`, weight: 8 },
    { name: 'quiz_analytics_students', role: 'teacher', path: `/api/t/${SLUG}/quiz-analytics/students`, weight: 8 },
    { name: 'teacher_notifications', role: 'teacher', path: `/api/t/${SLUG}/notifications`, weight: 5 },
    { name: 'teacher_unread', role: 'teacher', path: `/api/t/${SLUG}/notifications/unread-count`, weight: 5 },
    { name: 'chat_unread', role: 'teacher', path: `/api/t/${SLUG}/chat/unread-count`, weight: 4 },
    { name: 'student_classes', role: 'student', path: `/api/t/${SLUG}/classes`, weight: 8 },
    { name: 'student_todo', role: 'student', path: `/api/t/${SLUG}/me/todo`, weight: 8 },
    { name: 'student_catalog', role: 'student', path: `/api/t/${SLUG}/classes/catalog`, weight: 5 },
    { name: 'student_unread', role: 'student', path: `/api/t/${SLUG}/notifications/unread-count`, weight: 5 },
  ];

  if (classId) {
    catalog.push({
      name: 'class_quizzes',
      role: 'teacher',
      path: `/api/t/${SLUG}/classes/${classId}/quizzes`,
      weight: 6,
    });
    catalog.push({
      name: 'quiz_class_overview',
      role: 'teacher',
      path: `/api/t/${SLUG}/quiz-analytics/class-overview?classId=${classId}`,
      weight: 6,
    });
  }

  const tokens = { teacher: teacher.accessToken, student: student.accessToken };
  const stages = [];

  for (const stage of STAGES) {
    console.log(`\n>> ${stage.name}: ${stage.vu} VU for ${stage.durationSec}s`);
    const result = await runStage(stage, catalog, tokens);
    stages.push(result);
    console.log(
      `   ${result.requests} req  ${result.rps} rps  p50=${result.latencyMs.p50}ms  p95=${result.latencyMs.p95}ms  p99=${result.latencyMs.p99}ms  errors=${result.errorRatePct}%`,
    );
    await new Promise((r) => setTimeout(r, 1500));
  }

  const allEndpointNames = [...new Set(stages.flatMap((s) => s.byEndpoint.map((e) => e.name)))];
  const endpointRamp = allEndpointNames.map((name) => ({
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
        rps: row ? Number(((row.requests / s.durationSec)).toFixed(1)) : 0,
      };
    }),
  }));

  const report = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      base: BASE,
      tenant: SLUG,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      classId: classId || null,
      notes: [
        'Closed-loop ramp: each virtual user issues the next request as soon as the previous finishes.',
        'Auth login is excluded from the ramp (tokens reused) so the 10/15min login limiter is not the bottleneck.',
        'API_RATE_LIMIT_MAX should be 0 or a high value during this run; production default is 600 req/min/IP.',
        'Run against the local Express + Prisma + PostgreSQL stack (tsx watch / development).',
      ],
    },
    stages,
    endpointRamp,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
