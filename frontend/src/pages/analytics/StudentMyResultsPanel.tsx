import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { CohortBand, TopicTrend } from '../../api/quizAnalytics.types';
import type { QuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import { FilterSelect, Metric, Panel, TopicMasteryBars } from '../../components/analytics/AnalyticsPrimitives';
import { MarksTrendChart } from '../../components/analytics/AnalyticsCharts';
import { Spinner } from '../../components/ui';

function bandCopy(band: CohortBand | null): string {
  if (band === 'top_25') return 'You are in the top quarter of this class';
  if (band === 'bottom_25') return 'You are in the lower quarter of this class — a good time to focus practice';
  if (band === 'mid') return 'You are in the middle of this class';
  return '';
}

function trendLabel(trend: TopicTrend | undefined): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

function deltaLabel(delta: number | null | undefined): string {
  if (delta == null) return '—';
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `${delta}%`;
  return '0%';
}

type AttemptTopicRow = {
  attemptId: string;
  quizTitle: string;
  percentage: number | null;
  topicBreakdown: unknown;
};

/** Scrollable per-quiz topic breakdown so long histories don't dominate the page. */
function TopicProgressAttemptList({
  attempts,
  slug,
}: {
  attempts: AttemptTopicRow[];
  slug: string | undefined;
}) {
  return (
    <div className="max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
      <div className="space-y-3">
        {attempts.map((a) => {
          const tb = a.topicBreakdown as Record<string, { percentage?: number }> | null;
          const rows = tb
            ? Object.entries(tb).map(([topic, v]) => ({
                topic,
                correct: 0,
                total: 0,
                percentage: v.percentage ?? 0,
              }))
            : [];
          return (
            <div
              key={a.attemptId}
              className="rounded-xl border border-slate-100 p-3 dark:border-white/10"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link
                  to={`/${slug}/attempts/${a.attemptId}/result`}
                  className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
                >
                  {a.quizTitle}
                </Link>
                <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {a.percentage != null ? `${a.percentage}%` : '—'}
                </span>
              </div>
              {rows.length > 0 ? (
                <TopicMasteryBars rows={rows} />
              ) : (
                <p className="text-xs text-slate-500">No topic breakdown.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ExamHistoryRow = {
  attemptId: string;
  quizTitle: string;
  classTitle?: string;
  percentage: number | null;
  score: number | null;
  totalMarks: number;
  submittedAt: string | null;
};

function formatAttemptDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/** Full quiz history — click any row to open the result page. */
function ExamResultsHistory({
  attempts,
  slug,
}: {
  attempts: ExamHistoryRow[];
  slug: string | undefined;
}) {
  const newestFirst = useMemo(
    () =>
      [...attempts].sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tb - ta;
      }),
    [attempts]
  );

  return (
    <Panel
      title="Exam history"
      subtitle="All quizzes you have taken. Open any result to review answers."
    >
      <div className="max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {newestFirst.map((a) => (
            <li key={a.attemptId}>
              <Link
                to={`/${slug}/attempts/${a.attemptId}/result`}
                className="flex items-center justify-between gap-3 px-1 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {a.quizTitle}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[a.classTitle, formatAttemptDate(a.submittedAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                    {a.percentage != null ? `${a.percentage}%` : '—'}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-500">
                    {a.score != null ? `${a.score}/${a.totalMarks}` : `—/${a.totalMarks}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function TopicChips({
  topics,
  tone,
  empty,
}: {
  topics: Array<{ topic: string; percentage: number; trend?: TopicTrend }>;
  tone: 'strength' | 'weak';
  empty: string;
}) {
  const styles =
    tone === 'strength'
      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'
      : 'border-rose-200/80 bg-rose-50 text-rose-950 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100';

  if (topics.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((t) => (
        <span
          key={t.topic}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${styles}`}
        >
          <span className="font-semibold">{t.topic}</span>
          <span className="tabular-nums text-xs opacity-80">{t.percentage}%</span>
          {t.trend ? (
            <span className="text-xs opacity-60" aria-hidden>
              {trendLabel(t.trend)}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export default function StudentMyResultsPanel({ api }: { api: QuizAnalyticsApi }) {
  const { slug } = useParams<{ slug: string }>();
  const [classId, setClassId] = useState('');

  const masteryQuery = useQuery({
    queryKey: ['my-mastery', slug, classId],
    queryFn: () => api.getMyMastery(classId ? { classId } : undefined),
  });

  const progressQuery = useQuery({
    queryKey: ['my-progress', slug, classId],
    queryFn: () => api.getMyProgress(classId ? { classId } : undefined),
  });

  const data = masteryQuery.data;
  const progress = progressQuery.data;
  const attempts = data?.attempts ?? [];

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attempts) {
      if (a.classId) map.set(a.classId, a.classTitle || `Class ${a.classId.slice(-6)}`);
    }
    for (const c of progress?.cohort ?? []) {
      if (c.classId) map.set(c.classId, c.classTitle);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [attempts, progress?.cohort]);

  const trendPoints = attempts.map((a) => ({
    at: a.submittedAt ?? '',
    scorePercent: a.percentage ?? 0,
    assessmentTitle: a.quizTitle,
    assessmentId: a.quizId,
    quizId: a.quizId,
    quizTitle: a.quizTitle,
    sampleCount: 1,
  }));

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const a of attempts) {
      const tb = a.topicBreakdown;
      if (tb && typeof tb === 'object') {
        for (const k of Object.keys(tb as object)) set.add(k);
      }
    }
    return [...set].sort();
  }, [attempts]);

  const [topicFilter, setTopicFilter] = useState('');

  const outcome = data?.summary?.outcomeMix ?? { correct: 0, wrong: 0, unanswered: 0 };
  const outcomeTotal = Math.max(1, outcome.correct + outcome.wrong + outcome.unanswered);

  const visibleCohort = (progress?.cohort ?? []).filter((c) => c.visible);
  const pending = progress?.nextActions.pendingQuizzes ?? [];
  const review = progress?.nextActions.reviewAttempt ?? null;
  const focusTopics = progress?.focusTopics ?? [];
  const improvingTopics = progress?.improvingTopics ?? [];

  const strengthTopics = useMemo(() => {
    const rows = (data?.topicMastery ?? []).filter((t) => t.total >= 2 && t.percentage >= 70);
    return [...rows].sort((a, b) => b.percentage - a.percentage).slice(0, 5);
  }, [data?.topicMastery]);

  const weakTopics = useMemo(() => {
    const rows = (data?.topicMastery ?? []).filter((t) => t.total >= 2 && t.percentage < 70);
    return [...rows].sort((a, b) => a.percentage - b.percentage).slice(0, 5);
  }, [data?.topicMastery]);

  const loading = masteryQuery.isLoading || progressQuery.isLoading;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your progress…" />
      </div>
    );
  }

  if (!data || attempts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-400">
        <p>No quiz attempts yet. Complete a quiz to see your progress analytics.</p>
        <Link
          to={`/${slug}/classes`}
          className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          Browse classes
        </Link>
      </div>
    );
  }

  const summary = progress?.summary ?? data.summary;
  const completed = summary?.completedCount ?? attempts.length;
  const published = progress?.consistency.publishedCount ?? completed;
  const delta = summary && 'deltaFromPrevious' in summary ? summary.deltaFromPrevious : null;
  const streak = summary && 'streak' in summary ? summary.streak ?? 0 : 0;

  return (
    <div className="space-y-6">
      {classOptions.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-ink-850 sm:p-5">
          <FilterSelect
            label="Filter by class"
            value={classId}
            onChange={setClassId}
            options={[{ value: '', label: 'All classes' }, ...classOptions]}
          />
        </div>
      )}

      {/* 1. Progress snapshot */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric
          label="Average score"
          value={summary?.averagePercentage != null ? `${summary.averagePercentage}%` : '—'}
        />
        <Metric
          label="Latest vs previous"
          value={deltaLabel(delta ?? null)}
        />
        <Metric label="Streak" value={streak > 0 ? `${streak}` : '—'} />
        <Metric label="Quizzes done" value={`${completed}${published ? ` / ${published}` : ''}`} />
        <Metric
          label="Best score"
          value={
            summary && 'bestPercentage' in summary && summary.bestPercentage != null
              ? `${summary.bestPercentage}%`
              : '—'
          }
        />
      </div>

      {/* Strength / weak areas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Strength areas" subtitle="Topics you score well on (70%+).">
          <TopicChips
            topics={strengthTopics}
            tone="strength"
            empty="No strong topics yet — keep practicing to build strengths."
          />
        </Panel>
        <Panel title="Areas to improve" subtitle="Topics below 70% that need more practice.">
          <TopicChips
            topics={weakTopics}
            tone="weak"
            empty="No weak topics flagged yet. Nice work staying consistent."
          />
        </Panel>
      </div>

      {/* Focus this week */}
      <Panel
        title="Focus this week"
        subtitle="Weakest topics from your graded quizzes — practice these first."
        action={
          focusTopics.length > 0 ? (
            <Link
              to={`/${slug}/ai?tool=tutor`}
              className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              Practice in AI Area
            </Link>
          ) : undefined
        }
      >
        {focusTopics.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Not enough topic data yet. Keep taking quizzes to unlock focus areas.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {focusTopics.map((t) => (
              <Link
                key={t.topic}
                to={`/${slug}/ai?tool=tutor`}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 transition hover:border-amber-300 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"
                title={`${t.missCount} missed of ${t.total}`}
              >
                <span className="font-semibold">{t.topic}</span>
                <span className="tabular-nums text-xs opacity-80">{t.percentage}%</span>
                <span className="text-xs opacity-60" aria-hidden>
                  {trendLabel(t.trend)}
                </span>
              </Link>
            ))}
          </div>
        )}
        {improvingTopics.length > 0 && (
          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
            Improving: {improvingTopics.map((t) => t.topic).join(', ')}
          </p>
        )}
      </Panel>

      <ExamResultsHistory attempts={attempts} slug={slug} />

      {/* How you compare (anonymous) */}
      {visibleCohort.length > 0 && (
        <Panel
          title="How you compare"
          subtitle="Anonymous class averages only — classmates are never named."
        >
          <div className="space-y-3">
            {visibleCohort.map((c) => (
              <div
                key={c.classId}
                className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/10"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.classTitle}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Your average{' '}
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {c.studentAveragePercent != null ? `${c.studentAveragePercent}%` : '—'}
                  </span>
                  {' · '}
                  Class average{' '}
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {c.classAveragePercent != null ? `${c.classAveragePercent}%` : '—'}
                  </span>
                </p>
                {bandCopy(c.band) && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{bandCopy(c.band)}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 4. Next steps */}
      <Panel title="Next steps" subtitle="What to do next based on your progress.">
        <ul className="space-y-3">
          {pending.slice(0, 4).map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{q.title}</p>
                <p className="text-xs text-slate-500">{q.classTitle}</p>
              </div>
              <Link
                to={`/${slug}/quizzes/${q.id}/take`}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Start
              </Link>
            </li>
          ))}
          {review && (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Review: {review.quizTitle}
                </p>
                <p className="text-xs text-slate-500">
                  Weakest recent attempt
                  {review.percentage != null ? ` · ${review.percentage}%` : ''}
                </p>
              </div>
              <Link
                to={`/${slug}/attempts/${review.attemptId}/result`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Review & explain
              </Link>
            </li>
          )}
          {pending.length === 0 && !review && (
            <li className="text-sm text-slate-500 dark:text-slate-400">
              You&apos;re caught up on quizzes.
              {focusTopics[0] ? (
                <>
                  {' '}
                  Practice{' '}
                  <Link
                    to={`/${slug}/ai?tool=flashcards`}
                    className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {focusTopics[0].topic}
                  </Link>{' '}
                  in AI Area.
                </>
              ) : (
                <> Keep up the great work.</>
              )}
            </li>
          )}
          {pending.length === 0 && review && focusTopics[0] && (
            <li className="text-sm text-slate-500 dark:text-slate-400">
              No pending quizzes — try{' '}
              <Link
                to={`/${slug}/ai?tool=tutor`}
                className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                AI tutor on {focusTopics[0].topic}
              </Link>
              .
            </li>
          )}
        </ul>
      </Panel>

      {/* 5. History: topic mastery, charts */}
      <Panel title="Topic mastery" subtitle="Overall correct rate by topic across your quizzes.">
        <TopicMasteryBars rows={data.topicMastery} />
      </Panel>

      <Panel
        title="Topic progress across quizzes"
        subtitle="How each topic evolved paper by paper."
        action={
          topics.length > 0 ? (
            <FilterSelect
              label="Topic"
              value={topicFilter}
              onChange={setTopicFilter}
              options={[
                { value: '', label: 'All topics (overview)' },
                ...topics.map((t) => ({ value: t, label: t })),
              ]}
            />
          ) : undefined
        }
      >
        {topicFilter ? (
          <MarksTrendChart
            seriesMode="student_submissions"
            points={attempts
              .map((a) => {
                const tb = a.topicBreakdown as Record<
                  string,
                  { percentage?: number; correct?: number; total?: number }
                > | null;
                const stat = tb?.[topicFilter];
                let pct: number | null = null;
                if (stat?.percentage != null) pct = stat.percentage;
                else if (stat && stat.total && stat.total > 0)
                  pct = Math.round(((stat.correct ?? 0) / stat.total) * 1000) / 10;
                if (pct == null) return null;
                return {
                  at: a.submittedAt ?? '',
                  scorePercent: pct,
                  assessmentTitle: a.quizTitle,
                  assessmentId: a.quizId,
                };
              })
              .filter(Boolean) as typeof trendPoints}
          />
        ) : (
          <TopicProgressAttemptList attempts={attempts} slug={slug} />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Score trend" subtitle="Your overall % on each quiz.">
          <MarksTrendChart seriesMode="student_submissions" points={trendPoints} />
        </Panel>
        <Panel title="Outcome mix" subtitle="Correct vs wrong vs unanswered across graded questions.">
          <div className="space-y-3">
            {[
              { label: 'Correct', value: outcome.correct, color: 'bg-emerald-500' },
              { label: 'Wrong', value: outcome.wrong, color: 'bg-rose-500' },
              { label: 'Unanswered', value: outcome.unanswered, color: 'bg-slate-400' },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>{row.label}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {row.value}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${(row.value / outcomeTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
