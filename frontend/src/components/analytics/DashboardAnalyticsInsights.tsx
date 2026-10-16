import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { createQuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import { Panel, TopicMasteryBars } from '../analytics/AnalyticsPrimitives';

/** Staff dashboard insight widgets (ScoreSmart workspace-style). */
export function DashboardAnalyticsInsights() {
  const t = useTenantApi();
  const { slug } = useParams<{ slug: string }>();
  const api = useMemo(() => createQuizAnalyticsApi(t), [t]);

  const q = useQuery({
    queryKey: ['quiz-analytics-dashboard-widgets', t.slug],
    queryFn: () => api.getDashboard(),
    staleTime: 60_000,
  });

  if (q.isLoading || !q.data) return null;
  const data = q.data;

  const rankedClasses = [...data.byAssessment]
    .reduce<Array<{ name: string; avg: number; count: number }>>((acc, row) => {
      const name = row.className ?? 'Class';
      const existing = acc.find((x) => x.name === name);
      if (existing) {
        if (row.averageScorePercent != null) {
          existing.avg =
            (existing.avg * existing.count + row.averageScorePercent) / (existing.count + 1);
          existing.count += 1;
        }
      } else if (row.averageScorePercent != null) {
        acc.push({ name, avg: row.averageScorePercent, count: 1 });
      }
      return acc;
    }, [])
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  const maxAvg = Math.max(1, ...rankedClasses.map((c) => c.avg));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Learning insights</h2>
        <Link
          to={`/${slug}/quiz-analytics`}
          className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Open analytics →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Class performance" subtitle="Average quiz scores by class.">
          {rankedClasses.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No graded quizzes yet.</p>
          ) : (
            <ul className="space-y-2">
              {rankedClasses.map((c) => (
                <li key={c.name}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                    <span className="tabular-nums text-slate-500">{Math.round(c.avg * 10) / 10}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(c.avg / maxAvg) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Topic mastery" subtitle="Weakest topics across your classes.">
          <TopicMasteryBars rows={data.topicAggregate.slice(0, 8)} />
        </Panel>
      </div>

      {data.topPerformersByClass.some((g) => g.students.length > 0) && (
        <Panel title="Top performers by class" subtitle="Highest average quiz scores (top 3).">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.topPerformersByClass
              .filter((g) => g.students.length > 0)
              .map((g) => (
                <div
                  key={g.classId}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {g.className}
                  </p>
                  <ol className="space-y-1.5">
                    {g.students.map((s, i) => (
                      <li key={s.studentId} className="flex items-center justify-between text-sm">
                        <span className="truncate text-slate-800 dark:text-slate-100">
                          {i + 1}. {s.studentName}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                          {s.scorePercent}%
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
