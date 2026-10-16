import type { TrendPoint, TrendSeriesResponse } from '../../api/quizAnalytics.types';

const PX_PER_ASSESSMENT = 120;
const MIN_CHART_WIDTH = 720;
const TREND_LINE = '#0d9488';
const COHORT_LINE = '#0f766e'; // brand/teal — distinct dashed overlay
const TREND_BAND_A = '#f1f5f9';
const TREND_BAND_B = '#f8fafc';
const TREND_FRAME = '#e2e8f0';

function shortenAssessmentLabel(title: string, max = 22): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1).trimEnd()}…`;
}

export function MarksTrendChart({
  seriesMode,
  points,
  cohortAverageByAssessmentId,
}: {
  seriesMode: TrendSeriesResponse['seriesMode'];
  points: TrendPoint[];
  /**
   * Optional per-quiz class-average overlay. When provided alongside a
   * student series, the chart renders a second dashed line so the teacher can
   * tell at a glance whether the student is performing above or below the
   * class average for each quiz.
   */
  cohortAverageByAssessmentId?: Map<string, number>;
}) {
  const H = 300;
  const pad = { t: 24, r: 32, b: 78, l: 56 };

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        No graded data for this filter yet.
      </div>
    );
  }

  const n = points.length;
  const naturalWidth = n <= 1 ? MIN_CHART_WIDTH : pad.l + pad.r + (n - 1) * PX_PER_ASSESSMENT;
  const W = Math.max(MIN_CHART_WIDTH, naturalWidth);
  const overflows = W > MIN_CHART_WIDTH;
  const plotRight = W - pad.r;
  const plotBottom = H - pad.b;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const xAt = (index: number) => pad.l + (n === 1 ? iw / 2 : (index / (n - 1)) * iw);
  const yAt = (score: number) => pad.t + ih - (score / 100) * ih;
  const bandLeft = (i: number) => (n === 1 || i === 0 ? pad.l : (xAt(i - 1) + xAt(i)) / 2);
  const bandRight = (i: number) =>
    n === 1 || i === n - 1 ? plotRight : (xAt(i) + xAt(i + 1)) / 2;
  const lineD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.scorePercent).toFixed(1)}`)
    .join(' ');

  // Build the cohort overlay path from the same x positions, skipping any
  // quiz without a matching class average. Each contiguous run of
  // values yields its own polyline so the line never cheats across gaps.
  const cohortValues: Array<{ x: number; y: number; pct: number; key: string } | null> =
    cohortAverageByAssessmentId && cohortAverageByAssessmentId.size > 0
      ? points.map((p, i) => {
          const pct = cohortAverageByAssessmentId.get(p.assessmentId);
          if (pct == null || Number.isNaN(pct)) return null;
          return { x: xAt(i), y: yAt(pct), pct, key: p.assessmentId };
        })
      : [];
  const cohortSegments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const v of cohortValues) {
    if (v) {
      current.push({ x: v.x, y: v.y });
    } else if (current.length > 0) {
      cohortSegments.push(current);
      current = [];
    }
  }
  if (current.length > 0) cohortSegments.push(current);
  const cohortPaths = cohortSegments
    .filter((seg) => seg.length >= 1)
    .map((seg) =>
      seg
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
        .join(' '),
    );
  const showCohort = cohortValues.some(Boolean);

  return (
    <div className="w-full rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner dark:border-white/10 dark:bg-white/5">
      <div className="overflow-x-auto overflow-y-hidden" style={{ scrollbarGutter: 'stable' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block h-auto min-h-[260px]"
          style={{ minWidth: '100%' }}
          role="img"
          aria-label="Score per quiz chart"
        >
          <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill={TREND_BAND_B} rx={14} stroke={TREND_FRAME} />
          {points.map((_, i) => (
            <rect
              key={`band-${i}`}
              x={bandLeft(i)}
              y={pad.t}
              width={Math.max(0, bandRight(i) - bandLeft(i))}
              height={ih}
              fill={i % 2 === 0 ? TREND_BAND_A : TREND_BAND_B}
            />
          ))}
          {[0, 20, 40, 60, 80, 100].map((y) => (
            <text key={y} x={pad.l - 10} y={yAt(y) + 4} textAnchor="end" className="fill-slate-500" fontSize={11}>
              {y}
            </text>
          ))}
          <line x1={pad.l} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke={TREND_FRAME} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={plotBottom} stroke={TREND_FRAME} />

          {/* Cohort line(s) — drawn first so student points sit on top. */}
          {showCohort &&
            cohortPaths.map((d, i) => (
              <path
                key={`cohort-path-${i}`}
                d={d}
                fill="none"
                stroke={COHORT_LINE}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
            ))}
          {showCohort &&
            cohortValues.map((v) =>
              v ? (
                <circle
                  key={`cohort-dot-${v.key}`}
                  cx={v.x}
                  cy={v.y}
                  r={3}
                  fill={COHORT_LINE}
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  <title>Class average — {v.pct}%</title>
                </circle>
              ) : null,
            )}

          <path d={lineD} fill="none" stroke={TREND_LINE} strokeWidth={2.5} strokeLinecap="round" />
          {points.map((p, pi) => {
            const cohort = cohortAverageByAssessmentId?.get(p.assessmentId);
            const delta = cohort != null ? Math.round((p.scorePercent - cohort) * 10) / 10 : null;
            const deltaLabel =
              delta == null ? '' : delta >= 0 ? ` (+${delta}% vs class)` : ` (${delta}% vs class)`;
            const title = p.quizTitle ?? p.assessmentTitle;
            return (
              <circle
                key={p.assessmentId}
                cx={xAt(pi)}
                cy={yAt(p.scorePercent)}
                r={4}
                fill="#fff"
                stroke={TREND_LINE}
                strokeWidth={2}
              >
                <title>
                  {title} — {p.scorePercent}%{deltaLabel}
                </title>
              </circle>
            );
          })}
          {points.map((p, idx) => (
            <g key={`lbl-${p.assessmentId}`} transform={`translate(${xAt(idx)}, ${H - 30})`}>
              <text textAnchor="end" transform="rotate(-28)" className="fill-slate-600" fontSize={10}>
                {shortenAssessmentLabel(p.quizTitle ?? p.assessmentTitle)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {n} quiz{n === 1 ? '' : 'zes'}
          {overflows ? ' · scroll →' : ''} ·{' '}
          {seriesMode === 'cohort_submissions' ? 'cohort average' : 'student scores'}
        </p>
        {showCohort && (
          <div className="flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-[2.5px] w-4 rounded-full"
                style={{ background: TREND_LINE }}
              />
              Student
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t-[2.5px] border-dashed"
                style={{ borderColor: COHORT_LINE }}
              />
              Class average
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SubmissionFunnelDonut({
  funnel,
}: {
  funnel: {
    expected: number;
    submitted: number;
    marked: number;
    reviewInProgress: number;
    failed: number;
  };
}) {
  const segments = [
    { label: 'Expected', value: funnel.expected, color: '#94a3b8' },
    { label: 'Submitted', value: funnel.submitted, color: '#0d9488' },
    { label: 'Marked', value: funnel.marked, color: '#10b981' },
    { label: 'In review', value: funnel.reviewInProgress, color: '#f59e0b' },
    { label: 'Failed / blocked', value: funnel.failed, color: '#f43f5e' },
  ];
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));

  return (
    <div className="space-y-4">
      {segments.map((seg) => (
        <div key={seg.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">{seg.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {seg.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoreHistogram({
  buckets,
}: {
  buckets: Array<{ bucket?: string; band?: string; count: number }>;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  if (buckets.every((b) => b.count === 0)) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No scores to chart.</p>
    );
  }
  return (
    <div className="flex h-40 items-end gap-1 pt-4">
      {buckets.map((b, i) => {
        const label = b.bucket ?? b.band ?? String(i);
        return (
          <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium tabular-nums text-slate-700 dark:text-slate-300">
              {b.count || ''}
            </span>
            <div
              className="min-h-[4px] w-full rounded-t bg-brand-500/80 transition-all"
              style={{ height: `${Math.max(4, (b.count / max) * 120)}px` }}
              title={`${label}: ${b.count}`}
            />
            <span
              className="w-full truncate text-center text-[9px] text-slate-400"
              title={label}
            >
              {label.replace('%', '')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Vertical bar chart: number of students who answered each question
 * correctly. Bar height encodes count; colour tone encodes difficulty
 * relative to total responses (red = hard, amber = medium, green = easy).
 *
 * Rendered as a single SVG that scales to the container width so a
 * long quiz still fits without horizontal scrolling.
 */
export function QuestionCorrectCountsChart({
  questions,
}: {
  questions: Array<{
    question: string;
    correctCount: number;
    sampleCount: number;
  }>;
}) {
  if (questions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No question-level data yet.
      </p>
    );
  }

  const maxCount = Math.max(
    1,
    ...questions.map((q) => q.sampleCount),
    ...questions.map((q) => q.correctCount),
  );
  const n = questions.length;
  const H = 260;
  const pad = { t: 20, r: 12, b: 36, l: 36 };
  const W = Math.max(480, pad.l + pad.r + n * 26);
  const ih = H - pad.t - pad.b;
  const slot = (W - pad.l - pad.r) / n;
  const barW = Math.max(4, slot * 0.65);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxCount * f));

  const toneFor = (correct: number, sample: number): string => {
    if (sample === 0) return '#cbd5e1';
    const pct = correct / sample;
    if (pct < 0.4) return '#f43f5e';
    if (pct < 0.7) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        preserveAspectRatio="xMinYMid meet"
        className="block h-auto"
        style={{ minWidth: '100%' }}
        role="img"
        aria-label="Correct answers per question"
      >
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc" rx={12} />
        {/* Y gridlines + labels */}
        {ticks.map((t) => {
          const y = pad.t + ih - (t / Math.max(1, maxCount)) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#e2e8f0" strokeDasharray="2 4" />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#64748b">
                {t}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {questions.map((q, i) => {
          const cx = pad.l + i * slot + slot / 2;
          const barH = (q.correctCount / Math.max(1, maxCount)) * ih;
          const x = cx - barW / 2;
          const y = pad.t + ih - barH;
          return (
            <g key={q.question}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={2}
                fill={toneFor(q.correctCount, q.sampleCount)}
              >
                <title>
                  Q{q.question}: {q.correctCount}/{q.sampleCount} correct
                </title>
              </rect>
              {(n <= 30 || i % Math.ceil(n / 20) === 0) && (
                <text x={cx} y={H - pad.b + 14} textAnchor="middle" fontSize={10} fill="#64748b">
                  Q{q.question}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={12}
          y={pad.t + ih / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${pad.t + ih / 2})`}
          fontSize={10}
          fill="#64748b"
        >
          Students correct
        </text>
      </svg>
      <div className="mt-2 flex items-center justify-end gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> ≥70%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /> 40–70%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-rose-500" /> &lt;40%
        </span>
      </div>
    </div>
  );
}

export function EngagementScatter({
  dots,
}: {
  dots: Array<{
    studentName: string;
    submissions: number;
    averageScorePercent: number | null;
  }>;
}) {
  if (dots.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No student data.</p>
    );
  }
  const W = 400;
  const H = 220;
  const pad = 32;
  const maxSubs = Math.max(1, ...dots.map((d) => d.submissions));
  const scored = dots.filter((d) => d.averageScorePercent != null);
  if (scored.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No scored students yet.
      </p>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <rect width={W} height={H} fill="#f8fafc" rx={12} />
      {scored.map((d, i) => {
        const x = pad + (d.submissions / maxSubs) * (W - pad * 2);
        const y = H - pad - ((d.averageScorePercent ?? 0) / 100) * (H - pad * 2);
        return (
          <circle key={i} cx={x} cy={y} r={5} fill="#0d9488" opacity={0.75}>
            <title>
              {d.studentName}: {d.averageScorePercent}% · {d.submissions} quizzes
            </title>
          </circle>
        );
      })}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">
        Submissions →
      </text>
      <text
        x={12}
        y={H / 2}
        transform={`rotate(-90 12 ${H / 2})`}
        textAnchor="middle"
        fontSize={10}
        fill="#64748b"
      >
        Avg %
      </text>
    </svg>
  );
}

export function StudentVsCohortBars({
  rows,
}: {
  rows: Array<{
    topic?: string;
    assessmentTitle?: string;
    studentPercent: number;
    cohortPercent: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No topic comparison data.
      </p>
    );
  }
  return (
    <div className="max-h-64 space-y-3 overflow-y-auto">
      {rows.map((r, idx) => {
        const label = r.topic ?? r.assessmentTitle ?? `Item ${idx + 1}`;
        return (
          <div key={`${label}-${idx}`}>
            <p className="mb-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
              {label}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="w-14 text-brand-600 dark:text-brand-400">Student</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${r.studentPercent}%` }}
                  />
                </div>
                <span className="w-10 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.studentPercent}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="w-14 text-slate-500 dark:text-slate-400">Class</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-slate-400"
                    style={{ width: `${r.cohortPercent}%` }}
                  />
                </div>
                <span className="w-10 tabular-nums text-slate-700 dark:text-slate-300">
                  {r.cohortPercent}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineStatusStrip({
  pipeline,
}: {
  pipeline: {
    marked: number;
    awaitingAnswerKey: number;
    awaitingConflictReview: number;
    pendingStudentConfirm: number;
    failedExtraction: number;
  };
}) {
  const segments = [
    { label: 'Marked', count: pipeline.marked, className: 'bg-emerald-500' },
    { label: 'Awaiting answer key', count: pipeline.awaitingAnswerKey, className: 'bg-amber-400' },
    { label: 'Conflict review', count: pipeline.awaitingConflictReview, className: 'bg-orange-400' },
    { label: 'Pending confirm', count: pipeline.pendingStudentConfirm, className: 'bg-violet-400' },
    { label: 'Failed', count: pipeline.failedExtraction, className: 'bg-rose-500' },
  ];
  const total = Math.max(1, segments.reduce((s, x) => s + x.count, 0));

  return (
    <div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                className={`${s.className} h-full`}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.className}`} />
            {s.label}: <strong className="text-slate-900 dark:text-slate-100">{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Simpler quiz funnel strip for Mindspark (expected / submitted / marked). */
export function QuizPipelineStrip({
  expected,
  submitted,
  marked,
}: {
  expected: number;
  submitted: number;
  marked: number;
}) {
  const segments = [
    { label: 'Expected', count: expected, className: 'bg-slate-400' },
    { label: 'Submitted', count: submitted, className: 'bg-brand-500' },
    { label: 'Marked', count: marked, className: 'bg-emerald-500' },
  ];
  const total = Math.max(1, segments.reduce((s, x) => s + x.count, 0));

  return (
    <div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                className={`${s.className} h-full`}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.className}`} />
            {s.label}: <strong className="text-slate-900 dark:text-slate-100">{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
