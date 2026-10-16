import { useEffect, useMemo, useState } from 'react';
import type { QuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import type {
  QuizDetailResponse,
  TeacherAnalyticsDashboard,
} from '../../api/quizAnalytics.types';
import {
  CohortPerformanceBlock,
  CohortScoreDistributionBlock,
  FilterSelect,
  Metric,
  Panel,
  TopicMasteryBars,
} from '../../components/analytics/AnalyticsPrimitives';
import {
  QuestionCorrectCountsChart,
  QuizPipelineStrip,
  ScoreHistogram,
} from '../../components/analytics/AnalyticsCharts';
import { AssessmentSubmissionsTable } from '../../components/analytics/AnalyticsTables';

export default function QuizzesAnalysisTab({
  dashboard,
  api,
  onDownloadPdf,
}: {
  dashboard: TeacherAnalyticsDashboard;
  api: QuizAnalyticsApi;
  onDownloadPdf?: (detail: QuizDetailResponse) => void;
}) {
  const quizzes = useMemo(() => {
    const list = dashboard.filterOptions.quizzes ?? dashboard.filterOptions.assessments;
    return [...list].sort((a, b) => {
      const ta = a.lastGradedAt ? new Date(a.lastGradedAt).getTime() : 0;
      const tb = b.lastGradedAt ? new Date(b.lastGradedAt).getTime() : 0;
      return tb - ta;
    });
  }, [dashboard]);

  const classes = dashboard.filterOptions.classes;
  const defaultQuiz = quizzes[0] ?? null;

  const defaultClassId = defaultQuiz?.classId ?? classes[0]?.id ?? '';
  const quizzesInDefaultClass = useMemo(
    () => quizzes.filter((q) => q.classId === defaultClassId),
    [quizzes, defaultClassId],
  );
  const defaultQuizId =
    defaultQuiz && defaultQuiz.classId === defaultClassId
      ? defaultQuiz.id
      : (quizzesInDefaultClass[0]?.id ?? '');

  const [classFilter, setClassFilterState] = useState(defaultClassId);
  const [quizId, setQuizId] = useState(defaultQuizId);
  const [detail, setDetail] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  function setClassFilter(nextClassId: string) {
    setClassFilterState(nextClassId);
    const inClass = quizzes.filter((q) => q.classId === nextClassId);
    if (!inClass.some((q) => q.id === quizId)) {
      setQuizId(inClass[0]?.id ?? '');
    }
  }

  function handleQuizChange(id: string) {
    setQuizId(id);
    const picked = quizzes.find((q) => q.id === id);
    if (picked?.classId) setClassFilterState(picked.classId);
  }

  const filteredQuizzes = useMemo(() => {
    if (!classFilter) return [];
    return quizzes.filter((q) => q.classId === classFilter);
  }, [quizzes, classFilter]);

  useEffect(() => {
    if (!classFilter && classes.length > 0) {
      setClassFilterState(classes[0]!.id);
    }
  }, [classes, classFilter]);

  useEffect(() => {
    if (!quizId && filteredQuizzes[0]) {
      setQuizId(filteredQuizzes[0].id);
      return;
    }
    if (quizId && !filteredQuizzes.some((q) => q.id === quizId)) {
      setQuizId(filteredQuizzes[0]?.id ?? '');
    }
  }, [filteredQuizzes, quizId]);

  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;
    setLoading(true);
    api
      .getQuizDetail(quizId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, quizId]);

  async function handleDownloadPdf() {
    if (!detail || pdfLoading || !onDownloadPdf) return;
    setPdfLoading(true);
    try {
      await Promise.resolve(onDownloadPdf(detail));
    } catch {
      window.alert('Could not generate the PDF report. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  const questionChartRows = useMemo(() => {
    if (!detail) return [];
    return detail.questionDifficulty.map((q) => ({
      question: String(q.questionNumber),
      correctCount: q.correctCount,
      sampleCount: q.totalAttempts,
    }));
  }, [detail]);

  const submissionRows = useMemo(() => {
    if (!detail) return [];
    return detail.submissions.map((s) => ({
      submissionId: s.submissionId || s.attemptId,
      studentName: s.studentName,
      rollNumber: null as string | null,
      submittedAt: s.submittedAt ?? '',
      scorePercent: s.scorePercent,
    }));
  }, [detail]);

  if (quizzes.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-400">
        No graded quizzes yet. Analytics will appear after attempts are marked.
      </p>
    );
  }

  if (classes.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-400">
        No classes yet. Create a class to view quiz analytics.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-ink-850">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FilterSelect
            label="Class"
            value={classFilter}
            onChange={setClassFilter}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            label="Quiz"
            value={quizId}
            onChange={handleQuizChange}
            options={filteredQuizzes.map((q) => ({
              value: q.id,
              label: q.title,
            }))}
          />
        </div>
        {detail && !loading && onDownloadPdf && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-1 sm:flex-row sm:items-center sm:justify-end dark:border-white/10">
            <p className="text-xs text-slate-500 sm:mr-auto dark:text-slate-400">
              Download a PDF with charts, KPIs, performers, and every student&apos;s mark for this
              quiz.
            </p>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </div>
        )}
      </div>

      {filteredQuizzes.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-ink-850 dark:text-slate-400">
          No graded quizzes for this class yet.
        </p>
      ) : loading && !detail ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading quiz analytics…
        </div>
      ) : detail ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Questions" value={String(detail.kpis.totalQuestions)} />
            <Metric
              label="Submissions"
              value={`${detail.kpis.submissions}/${detail.kpis.expectedSubmissions}`}
            />
            <Metric label="Marked" value={String(detail.kpis.markedCount)} />
            <Metric
              label="Average"
              value={
                detail.kpis.averageScorePercent == null
                  ? '—'
                  : `${detail.kpis.averageScorePercent}%`
              }
            />
          </div>

          <Panel title="Marking pipeline" subtitle="Where submissions stand for this quiz.">
            <QuizPipelineStrip
              expected={detail.pipeline.expected}
              submitted={detail.pipeline.submitted}
              marked={detail.pipeline.marked}
            />
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Score distribution">
              <CohortScoreDistributionBlock data={detail.scoreDistribution} loading={loading} />
            </Panel>
            <Panel title="Score histogram" subtitle="10% buckets across marked attempts.">
              <ScoreHistogram buckets={detail.scoreDistribution.histogram ?? []} />
            </Panel>
          </div>

          <Panel title="Top & bottom performers">
            <CohortPerformanceBlock data={detail.leaderboard} loading={loading} />
          </Panel>

          <Panel
            title="Question performance"
            subtitle="Students who answered each question correctly."
          >
            <QuestionCorrectCountsChart questions={questionChartRows} />
          </Panel>

          <Panel title="Topic mastery">
            <TopicMasteryBars rows={detail.topicMastery} />
          </Panel>

          <Panel title="Submissions">
            <AssessmentSubmissionsTable rows={submissionRows} />
          </Panel>
        </>
      ) : (
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load quiz detail.</p>
      )}
    </div>
  );
}
