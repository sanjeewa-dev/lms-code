import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QuizAnalyticsApi } from '../../api/quizAnalyticsApi';
import type {
  CohortOverviewResponse,
  StudentDetailResponse,
  StudentsEngagementResponse,
  StudentsEngagementRow,
  TeacherAnalyticsDashboard,
  TrendSeriesResponse,
} from '../../api/quizAnalytics.types';
import {
  FilterSelect,
  Metric,
  Panel,
  TopicMasteryBars,
} from '../../components/analytics/AnalyticsPrimitives';
import { MarksTrendChart, StudentVsCohortBars } from '../../components/analytics/AnalyticsCharts';
import {
  EngagementTable,
  RecentActivityTimeline,
  StudentAssessmentsTable,
} from '../../components/analytics/AnalyticsTables';

type CohortStudentsModalKind = 'cohort-avg' | 'needs-attention' | null;

function StudentCohortListModal({
  open,
  title,
  subtitle,
  rows,
  showClassName,
  onClose,
  onSelectStudent,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  rows: StudentsEngagementRow[];
  showClassName?: boolean;
  onClose: () => void;
  onSelectStudent: (studentId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohort-students-modal-title"
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl outline-none dark:border-white/10 dark:bg-ink-850"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-white/10">
          <div>
            <h2
              id="cohort-students-modal-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No students to show.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="hidden pb-2 font-medium sm:table-cell">ID</th>
                  <th className="pb-2 text-right font-medium">Cohort avg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.studentId}-${row.classId}`}
                    className="border-b border-slate-50 last:border-0 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-2">
                      <button
                        type="button"
                        onClick={() => onSelectStudent(row.studentId)}
                        className="text-left font-medium text-brand-700 hover:underline dark:text-brand-400"
                      >
                        {row.studentName}
                      </button>
                      {showClassName ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">{row.className}</p>
                      ) : null}
                    </td>
                    <td className="hidden py-2.5 text-slate-500 sm:table-cell dark:text-slate-400">
                      {row.rollNumber ?? '—'}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {row.averageScorePercent == null ? '—' : `${row.averageScorePercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentsAnalysisTab({
  dashboard,
  api,
}: {
  dashboard: TeacherAnalyticsDashboard;
  api: QuizAnalyticsApi;
}) {
  // `classId` + `studentId` are URL-bound so other pages can deep-link
  // straight into a specific student's analytics.
  const [searchParams, setSearchParams] = useSearchParams();
  const [classFilter, setClassFilterState] = useState(() => searchParams.get('classId') ?? '');
  const [studentId, setStudentIdState] = useState(() => searchParams.get('studentId') ?? '');

  const writeUrl = useCallback(
    (nextClassId: string, nextStudentId: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('tab', 'students');
      if (nextClassId) params.set('classId', nextClassId);
      else params.delete('classId');
      if (nextStudentId) params.set('studentId', nextStudentId);
      else params.delete('studentId');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  function setClassFilter(next: string) {
    setClassFilterState(next);
    writeUrl(next, studentId);
  }
  function setStudentId(next: string) {
    setStudentIdState(next);
    writeUrl(classFilter, next);
  }

  useEffect(() => {
    const urlClass = searchParams.get('classId') ?? '';
    const urlStudent = searchParams.get('studentId') ?? '';
    if (urlClass !== classFilter) setClassFilterState(urlClass);
    if (urlStudent !== studentId) setStudentIdState(urlStudent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [cohort, setCohort] = useState<CohortOverviewResponse | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [studentDetail, setStudentDetail] = useState<StudentDetailResponse | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [trend, setTrend] = useState<TrendSeriesResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [engagement, setEngagement] = useState<StudentsEngagementResponse | null>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [cohortModal, setCohortModal] = useState<CohortStudentsModalKind>(null);

  const visibleStudents = useMemo(() => {
    const all = dashboard.filterOptions.students;
    if (!classFilter) return all;
    return all.filter((s) => s.classIds?.includes(classFilter));
  }, [dashboard.filterOptions.students, classFilter]);

  const cohortStudentRows = useMemo(() => {
    return [...(engagement?.rows ?? [])].sort(
      (a, b) => (b.averageScorePercent ?? -1) - (a.averageScorePercent ?? -1),
    );
  }, [engagement]);

  const needsAttentionRows = useMemo(
    () =>
      cohortStudentRows.filter(
        (r) => r.averageScorePercent != null && r.averageScorePercent < 50,
      ),
    [cohortStudentRows],
  );

  const selectedClassName = classFilter
    ? dashboard.filterOptions.classes.find((c) => c.id === classFilter)?.name
    : null;

  function openStudentFromModal(id: string) {
    setCohortModal(null);
    setStudentId(id);
  }

  const cohortAverageByAssessmentId = useMemo(() => {
    const map = new Map<string, number>();
    if (!studentDetail) return map;
    for (const row of studentDetail.studentVsCohort) {
      const key = row.assessmentId;
      if (row.cohortPercent != null) {
        map.set(key, row.cohortPercent);
      }
    }
    return map;
  }, [studentDetail]);

  const studentAssessmentRows = useMemo(() => {
    if (!studentDetail) return [];
    const cohortById = new Map(
      studentDetail.studentVsCohort.map((r) => [r.assessmentId, r] as const),
    );
    return studentDetail.assessments.map((a, idx) => {
      const vs = cohortById.get(a.assessmentId);
      return {
        assessmentId: a.assessmentId,
        quizId: a.quizId,
        title: a.quizTitle ?? a.assessmentTitle,
        className: a.className,
        submittedAt: a.submittedAt ?? '',
        scorePercent: a.scorePercent,
        classAveragePercent: vs?.cohortPercent ?? null,
        submissionId: a.quizId ?? a.assessmentId ?? `row-${idx}`,
      };
    });
  }, [studentDetail]);

  const activityItems = useMemo(() => {
    if (!studentDetail) return [];
    return studentDetail.recentActivity.map((item, idx) => {
      const labelLower = item.label.toLowerCase();
      return {
        submissionId: `${item.at}-${idx}`,
        type: labelLower.includes('grad') || labelLower.includes('mark') ? 'graded' : 'submitted',
        assessmentTitle: item.assessmentTitle,
        className: null as string | null,
        at: item.at,
        scorePercent: item.scorePercent,
      };
    });
  }, [studentDetail]);

  const vsCohortBars = useMemo(() => {
    if (!studentDetail) return [];
    return studentDetail.studentVsCohort.map((r) => ({
      topic: r.quizTitle ?? r.assessmentTitle,
      studentPercent: r.studentPercent ?? 0,
      cohortPercent: r.cohortPercent ?? 0,
    }));
  }, [studentDetail]);

  useEffect(() => {
    if (!studentId) return;
    if (!visibleStudents.some((s) => s.id === studentId)) {
      setStudentId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleStudents, studentId]);

  useEffect(() => {
    if (studentId) return;
    let cancelled = false;
    setCohortLoading(true);
    api
      .getCohortOverview({ classId: classFilter || undefined })
      .then((data) => {
        if (!cancelled) setCohort(data);
      })
      .catch(() => {
        if (!cancelled) setCohort(null);
      })
      .finally(() => {
        if (!cancelled) setCohortLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, studentId, classFilter]);

  useEffect(() => {
    let cancelled = false;
    setEngagementLoading(true);
    api
      .getStudentsEngagement({ classId: classFilter || undefined, pageSize: 500 })
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
  }, [api, classFilter, studentId]);

  useEffect(() => {
    if (!studentId) {
      setStudentDetail(null);
      setTrend(null);
      return;
    }
    let cancelled = false;
    setStudentLoading(true);
    setTrendLoading(true);
    api
      .getStudentDetail(studentId, { classId: classFilter || undefined })
      .then((data) => {
        if (!cancelled) setStudentDetail(data);
      })
      .catch(() => {
        if (!cancelled) setStudentDetail(null);
      })
      .finally(() => {
        if (!cancelled) setStudentLoading(false);
      });
    api
      .getTrends({
        studentId,
        classId: classFilter || undefined,
      })
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
  }, [api, studentId, classFilter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 dark:border-white/10 dark:bg-ink-850">
        <FilterSelect
          label="Class (optional)"
          value={classFilter}
          onChange={setClassFilter}
          options={[
            { value: '', label: 'All classes' },
            ...dashboard.filterOptions.classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelect
          label="Student (detail mode)"
          value={studentId}
          onChange={setStudentId}
          options={[
            {
              value: '',
              label:
                classFilter && visibleStudents.length === 0
                  ? '— No students in this class —'
                  : '— Cohort overview —',
            },
            ...visibleStudents.map((s) => ({ value: s.id, label: s.fullName })),
          ]}
        />
      </div>

      {!studentId ? (
        <>
          {cohortLoading && !cohort ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading cohort overview…
            </p>
          ) : cohort ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric label="Active students" value={String(cohort.kpis.activeStudents)} />
                <Metric
                  label="Cohort avg"
                  value={
                    cohort.kpis.cohortAveragePercent == null
                      ? '—'
                      : `${cohort.kpis.cohortAveragePercent}%`
                  }
                  onClick={() => setCohortModal('cohort-avg')}
                />
                <Metric
                  label="Needs attention"
                  value={String(cohort.kpis.studentsNeedingAttention)}
                  hint="Avg below 50%"
                  onClick={() => setCohortModal('needs-attention')}
                />
              </div>
            </>
          ) : null}

          <Panel title="Roster engagement" subtitle="All students across your classes.">
            <EngagementTable
              rows={engagement?.rows ?? []}
              loading={engagementLoading}
              showClass
            />
          </Panel>

          <StudentCohortListModal
            open={cohortModal === 'cohort-avg'}
            title={
              selectedClassName
                ? `Cohort average — ${selectedClassName}`
                : 'Cohort average — all classes'
            }
            subtitle="Students sorted by average score across marked quizzes."
            rows={cohortStudentRows}
            showClassName={!classFilter}
            onClose={() => setCohortModal(null)}
            onSelectStudent={openStudentFromModal}
          />
          <StudentCohortListModal
            open={cohortModal === 'needs-attention'}
            title={
              selectedClassName
                ? `Needs attention — ${selectedClassName}`
                : 'Needs attention — all classes'
            }
            subtitle="Students with cohort average below 50%."
            rows={needsAttentionRows}
            showClassName={!classFilter}
            onClose={() => setCohortModal(null)}
            onSelectStudent={openStudentFromModal}
          />
        </>
      ) : studentLoading && !studentDetail ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading student profile…
        </p>
      ) : studentDetail ? (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink-850">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                {studentDetail.profile.fullName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {studentDetail.profile.fullName}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {studentDetail.profile.classes.map((c) => c.name).join(', ') || 'No classes'}
                </p>
                {studentDetail.profile.email &&
                  !studentDetail.profile.email.endsWith('@noemail.local') && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {studentDetail.profile.email}
                    </p>
                  )}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
                <Metric label="Marked" value={String(studentDetail.kpis.papersGraded)} />
                <Metric
                  label="Avg"
                  value={
                    studentDetail.kpis.averageScorePercent == null
                      ? '—'
                      : `${studentDetail.kpis.averageScorePercent}%`
                  }
                />
                <Metric
                  label="Best"
                  value={
                    studentDetail.kpis.bestScorePercent == null
                      ? '—'
                      : `${studentDetail.kpis.bestScorePercent}%`
                  }
                />
                <Metric
                  label="Latest"
                  value={
                    studentDetail.kpis.latestScorePercent == null
                      ? '—'
                      : `${studentDetail.kpis.latestScorePercent}%`
                  }
                />
              </div>
            </div>
          </div>

          {studentDetail.improvement.delta != null && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                studentDetail.improvement.delta >= 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
              }`}
            >
              {studentDetail.improvement.label || (
                <>
                  Improvement delta:{' '}
                  {studentDetail.improvement.delta >= 0 ? '+' : ''}
                  {studentDetail.improvement.delta}%
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Score trend">
              {trendLoading && !trend ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Loading…
                </p>
              ) : (
                <MarksTrendChart
                  seriesMode={trend?.seriesMode ?? 'student_submissions'}
                  points={trend?.points ?? []}
                  cohortAverageByAssessmentId={cohortAverageByAssessmentId}
                />
              )}
            </Panel>
            <Panel title="Topic mastery">
              <TopicMasteryBars rows={studentDetail.topicMastery} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Strengths">
              {studentDetail.strengths.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No strong topics yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {studentDetail.strengths.map((t) => (
                    <span
                      key={t.topic}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    >
                      {t.topic} ({t.percentage}%)
                    </span>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Weaknesses">
              {studentDetail.weaknesses.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No weak topics identified.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {studentDetail.weaknesses.map((t) => (
                    <span
                      key={t.topic}
                      className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      {t.topic} ({t.percentage}%)
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Student vs class" subtitle="Quiz % compared to class cohort.">
            <StudentVsCohortBars rows={vsCohortBars} />
          </Panel>

          <Panel title="Per-quiz results">
            <StudentAssessmentsTable rows={studentAssessmentRows} />
          </Panel>

          <Panel title="Recent activity">
            <RecentActivityTimeline items={activityItems} />
          </Panel>
        </>
      ) : (
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load student detail.</p>
      )}
    </div>
  );
}
