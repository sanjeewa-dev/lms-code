import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { QuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import type {
  ClassOverviewResponse,
  StudentsEngagementResponse,
  TeacherAnalyticsDashboard,
  TrendSeriesResponse,
} from '../../api/quizAnalytics.types';
import {
  CohortPerformerList,
  FilterSelect,
  Metric,
  Panel,
} from '../../components/analytics/AnalyticsPrimitives';
import { MarksTrendChart } from '../../components/analytics/AnalyticsCharts';
import { ClassAssessmentsTable, EngagementTable } from '../../components/analytics/AnalyticsTables';

type TrendWindow = 'last5' | 'all';

export default function ClassesAnalysisTab({
  dashboard,
  api,
}: {
  dashboard: TeacherAnalyticsDashboard;
  api: QuizAnalyticsApi;
}) {
  const { slug = '' } = useParams<{ slug: string }>();
  const classes = dashboard.filterOptions.classes;
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [overview, setOverview] = useState<ClassOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [trend, setTrend] = useState<TrendSeriesResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('last5');
  const [engagement, setEngagement] = useState<StudentsEngagementResponse | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0]!.id);
  }, [classes, classId]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setOverviewLoading(true);
    api
      .getClassOverview(classId)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, classId]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setTrendLoading(true);
    api
      .getTrends({ classId })
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch(() => {
        if (!cancelled) setTrend(null);
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, classId]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setEngagementLoading(true);
    api
      .getStudentsEngagement({ classId, pageSize: 100 })
      .then((data) => {
        if (!cancelled) setEngagement(data);
      })
      .catch(() => {
        if (!cancelled) setEngagement(null);
      })
      .finally(() => {
        if (!cancelled) setEngagementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, classId]);

  const engagementList = engagement?.rows ?? [];
  const assessments = overview?.quizzes ?? overview?.assessments ?? [];
  const quizCount = overview?.kpis.totalQuizzes ?? overview?.kpis.totalAssessments ?? 0;
  const activeCount = overview?.kpis.activeAssessments ?? 0;

  if (classes.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-400">
        Create a class first to see class-level analytics.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-ink-850">
        <FilterSelect
          label="Class"
          value={classId}
          onChange={setClassId}
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      {overviewLoading && !overview ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading class overview…
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Enrolled" value={String(overview.kpis.enrolledStudents)} />
            <Metric
              label="Assessments / Quizzes"
              value={`${quizCount} (${activeCount} active)`}
            />
          </div>

          <Panel
            title="Score trend"
            subtitle="Average score per quiz in this class."
            action={
              <TrendWindowToggle
                value={trendWindow}
                onChange={setTrendWindow}
                totalPoints={trend?.points.length ?? 0}
              />
            }
          >
            {trendLoading && !trend ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading chart…
              </p>
            ) : (
              <MarksTrendChart
                seriesMode={trend?.seriesMode ?? 'cohort_submissions'}
                points={
                  trendWindow === 'last5'
                    ? (trend?.points ?? []).slice(-5)
                    : (trend?.points ?? [])
                }
              />
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Top performers">
              <CohortPerformerList title="Top 3" performers={overview.topPerformers} tone="up" />
            </Panel>
            <Panel title="Needs attention">
              <CohortPerformerList
                title="Bottom 3"
                performers={overview.bottomPerformers}
                tone="attention"
              />
            </Panel>
          </div>

          <Panel title="Quizzes in this class">
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <ClassAssessmentsTable
                rows={assessments}
                getQuizHref={() => `/${slug}/classes/${classId}/quizzes`}
              />
            </div>
          </Panel>

          <Panel title="Roster engagement" subtitle="Per-student submission and score summary.">
            <div className="max-h-[min(640px,70vh)] overflow-y-auto pr-1">
              <EngagementTable rows={engagementList} loading={engagementLoading} />
            </div>
          </Panel>
        </>
      ) : (
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load class overview.</p>
      )}
    </div>
  );
}

function TrendWindowToggle({
  value,
  onChange,
  totalPoints,
}: {
  value: TrendWindow;
  onChange: (next: TrendWindow) => void;
  totalPoints: number;
}) {
  const options: Array<{ id: TrendWindow; label: string }> = [
    { id: 'last5', label: 'Last 5' },
    { id: 'all', label: `All${totalPoints > 0 ? ` (${totalPoints})` : ''}` },
  ];
  return (
    <div
      role="tablist"
      aria-label="Score trend window"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-white/5"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-3 py-1 font-medium transition ${
              active
                ? 'border border-slate-200 bg-white text-brand-700 shadow-sm dark:border-white/10 dark:bg-ink-850 dark:text-brand-300'
                : 'text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
