import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenantApi } from '../../hooks/useTenantApi';
import { createQuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import {
  CohortPerformanceBlock,
  CohortScoreDistributionBlock,
  Panel,
} from '../analytics/AnalyticsPrimitives';
import { ScoreHistogram } from '../analytics/AnalyticsCharts';
import { Spinner } from '../ui';

/** ScoreSmart-style leaderboard + score distribution for a single quiz. */
export function QuizAnalyticsResultsCards({ quizId }: { quizId: string }) {
  const t = useTenantApi();
  const api = useMemo(() => createQuizAnalyticsApi(t), [t]);
  const [view, setView] = useState<'performance' | 'distribution'>('performance');

  const lbQuery = useQuery({
    queryKey: ['quiz-analytics-lb', t.slug, quizId],
    queryFn: () => api.getLeaderboard({ quizId, size: 5 }),
  });
  const distQuery = useQuery({
    queryKey: ['quiz-analytics-dist', t.slug, quizId],
    queryFn: () => api.getScoreDistribution({ quizId }),
  });

  if (lbQuery.isLoading || distQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/5 dark:bg-ink-850">
        <Spinner label="Loading analytics…" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
        {(
          [
            { id: 'performance' as const, label: 'Performers' },
            { id: 'distribution' as const, label: 'Distribution' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setView(opt.id)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              view === opt.id
                ? 'border border-slate-200 bg-white text-brand-700 shadow-sm dark:border-white/10 dark:bg-ink-850 dark:text-brand-300'
                : 'text-slate-500 hover:text-brand-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {view === 'performance' ? (
        <Panel title="Performance" subtitle="Top and bottom scorers on this quiz.">
          <CohortPerformanceBlock data={lbQuery.data ?? null} loading={lbQuery.isFetching} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Score bands" subtitle="Share of students in each band.">
            <CohortScoreDistributionBlock
              data={distQuery.data ?? null}
              loading={distQuery.isFetching}
            />
          </Panel>
          <Panel title="Histogram" subtitle="Fine-grained score buckets.">
            <ScoreHistogram buckets={distQuery.data?.histogram ?? distQuery.data?.bands ?? []} />
          </Panel>
        </div>
      )}
    </div>
  );
}
