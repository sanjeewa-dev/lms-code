import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import {
  AnalyticsTabBar,
  Metric,
  type AnalyticsTab,
} from '../components/analytics/AnalyticsPrimitives';
import { createQuizAnalyticsApi } from '../api/quizAnalyticsApi';
import type { QuizDetailResponse, TeacherAnalyticsDashboard } from '../api/quizAnalytics.types';
import ClassesAnalysisTab from './analytics/ClassesAnalysisTab';
import QuizzesAnalysisTab from './analytics/QuizzesAnalysisTab';
import StudentsAnalysisTab from './analytics/StudentsAnalysisTab';
import StudentMyResultsPanel from './analytics/StudentMyResultsPanel';
import { downloadQuizAnalyticsPdf } from '../lib/quizReportPdf';

const VALID_TABS: AnalyticsTab[] = ['classes', 'quizzes', 'students'];

function parseTab(raw: string | null): AnalyticsTab {
  return (VALID_TABS as string[]).includes(raw ?? '') ? (raw as AnalyticsTab) : 'classes';
}

export default function QuizAnalyticsPage() {
  const t = useTenantApi();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStaff = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'superadmin';
  const api = useMemo(() => createQuizAnalyticsApi(t), [t]);

  const [tab, setTab] = useState<AnalyticsTab>(() => parseTab(searchParams.get('tab')));

  useEffect(() => {
    const fromUrl = parseTab(searchParams.get('tab'));
    if (fromUrl !== tab) setTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleTabChange(next: AnalyticsTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  const dashboardQuery = useQuery({
    queryKey: ['quiz-analytics-dashboard', t.slug],
    enabled: isStaff,
    queryFn: () => api.getDashboard(),
  });

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-ink-850">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">My results</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Topic mastery, score trends, and quiz outcomes.
          </p>
        </div>
        <StudentMyResultsPanel api={api} />
      </div>
    );
  }

  const data = dashboardQuery.data as TeacherAnalyticsDashboard | undefined;

  function handlePdf(detail: QuizDetailResponse) {
    downloadQuizAnalyticsPdf(detail);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to={`/${slug}/dashboard`} className="transition hover:text-brand-600">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-700 dark:text-slate-200">Analytics</span>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-ink-850">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Quiz Analytics</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Class trends, quiz performance, and student mastery.
        </p>
      </div>

      {dashboardQuery.isError && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Failed to load analytics.</span>
          <button
            type="button"
            onClick={() => dashboardQuery.refetch()}
            className="shrink-0 font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {dashboardQuery.isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading analytics…" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Classes" value={String(data.summary.classCount)} />
            <Metric
              label="Quizzes"
              value={String(data.summary.quizCount ?? data.summary.assessmentCount)}
            />
            <Metric label="Attempts submitted" value={String(data.summary.totalSubmissions)} />
            <Metric
              label="Average score"
              value={
                data.summary.averageScorePercent != null
                  ? `${data.summary.averageScorePercent}%`
                  : '—'
              }
            />
          </div>

          <AnalyticsTabBar value={tab} onChange={handleTabChange} />

          {tab === 'classes' && <ClassesAnalysisTab dashboard={data} api={api} />}
          {tab === 'quizzes' && (
            <QuizzesAnalysisTab dashboard={data} api={api} onDownloadPdf={handlePdf} />
          )}
          {tab === 'students' && <StudentsAnalysisTab dashboard={data} api={api} />}
        </>
      ) : null}
    </div>
  );
}
