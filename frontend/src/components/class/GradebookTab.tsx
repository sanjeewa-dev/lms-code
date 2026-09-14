import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenantApi } from '../../hooks/useTenantApi';
import { Button, Card, EmptyState, ErrorBanner, Input, Select, Spinner } from '../ui';
import { Icon, type IconName } from '../icons';
import { useAuth } from '../../context/AuthContext';
import type { ClassSummary } from '../../api/types';
import { PerformanceChart, type PerformancePoint } from '../PerformanceChart';

type StaffGradebook = {
  assessments: { id: string; title: string; maxMarks: number | null }[];
  quizzes: { id: string; title: string; totalMarks: number }[];
  rows: {
    student: { id: string; name: string; email: string };
    assignments: { assessmentId: string; grade: number | null; maxMarks: number | null }[];
    quizzes: { quizId: string; score: number | null; totalMarks: number }[];
    percent: number | null;
  }[];
};

type StudentGradebook = {
  assignments: {
    id: string;
    title: string;
    maxMarks: number | null;
    grade: number | null;
    feedback: string | null;
  }[];
  quizzes: { id: string; title: string; totalMarks: number; score: number | null }[];
};

type RowStatus = 'all' | 'has-grades' | 'missing' | 'at-risk';
type StaffRow = StaffGradebook['rows'][number];

function percentTone(percent: number | null): string {
  if (percent == null) return 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400';
  if (percent >= 80) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (percent >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300';
}

function scoreCell(value: number | null, max: number | null | undefined) {
  if (value == null) {
    return (
      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400 dark:bg-white/5">
        —
      </span>
    );
  }
  const ratio = max && max > 0 ? value / max : null;
  const tone =
    ratio == null
      ? 'text-slate-800 dark:text-slate-100'
      : ratio >= 0.8
        ? 'text-emerald-700 dark:text-emerald-300'
        : ratio >= 0.5
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-red-700 dark:text-red-300';
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {value}
      {max != null ? <span className="font-normal text-slate-400">/{max}</span> : null}
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconName;
  tone: string;
}) {
  return (
    <Card className="flex items-start gap-3 !p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon name={icon} width={18} height={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
      </div>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Build progress series from filtered rows (class avg) or a single student. */
function buildProgressSeries(
  data: StaffGradebook,
  rows: StaffRow[],
  mode: 'student' | 'class'
): {
  overall: PerformancePoint[];
  quizzes: PerformancePoint[];
  assignments: PerformancePoint[];
  scopeLabel: string;
} {
  const focus = mode === 'student' && rows.length === 1 ? rows[0] : null;
  const cohort = focus ? [focus] : rows;
  const scopeLabel = focus
    ? focus.student.name
    : cohort.length === data.rows.length
      ? 'Class average'
      : `Filtered group (${cohort.length})`;

  const assignmentsAll: PerformancePoint[] = data.assessments.map((a, idx) => {
    const values: number[] = [];
    let scoreSum = 0;
    let scoreCount = 0;
    for (const row of cohort) {
      const cell = row.assignments[idx];
      if (!cell || cell.grade == null) continue;
      const max = cell.maxMarks ?? a.maxMarks;
      if (max != null && max > 0) {
        values.push((cell.grade / max) * 100);
        scoreSum += cell.grade;
        scoreCount += 1;
      }
    }
    return {
      label: a.title,
      percentage: values.length ? (avg(values) ?? 0) : 0,
      score: scoreCount ? Math.round(scoreSum / scoreCount) : undefined,
      totalMarks: a.maxMarks ?? undefined,
      _hasScore: values.length > 0,
    } as PerformancePoint & { _hasScore: boolean };
  });

  const quizzesAll: PerformancePoint[] = data.quizzes.map((q, idx) => {
    const values: number[] = [];
    let scoreSum = 0;
    let scoreCount = 0;
    for (const row of cohort) {
      const cell = row.quizzes[idx];
      if (!cell || cell.score == null) continue;
      const max = cell.totalMarks || q.totalMarks || 1;
      values.push((cell.score / max) * 100);
      scoreSum += cell.score;
      scoreCount += 1;
    }
    return {
      label: q.title,
      percentage: values.length ? (avg(values) ?? 0) : 0,
      score: scoreCount ? Math.round(scoreSum / scoreCount) : undefined,
      totalMarks: q.totalMarks,
      _hasScore: values.length > 0,
    } as PerformancePoint & { _hasScore: boolean };
  });

  const assignments = (assignmentsAll as (PerformancePoint & { _hasScore?: boolean })[])
    .filter((p) => p._hasScore)
    .map(({ _hasScore: _, ...p }) => p);
  const quizzes = (quizzesAll as (PerformancePoint & { _hasScore?: boolean })[])
    .filter((p) => p._hasScore)
    .map(({ _hasScore: _, ...p }) => p);

  return {
    overall: [...assignments, ...quizzes],
    quizzes,
    assignments,
    scopeLabel,
  };
}

function ChartPanel({
  title,
  subtitle,
  points,
  color,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  points: PerformancePoint[];
  color: string;
  emptyMessage: string;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl !p-0">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-white/5 dark:bg-white/5">
        <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="px-3 py-3 sm:px-4">
        <PerformanceChart points={points} height={220} color={color} emptyMessage={emptyMessage} />
      </div>
    </Card>
  );
}

export function GradebookTab({ classId, classTitle }: { classId: string; classTitle?: string }) {
  const t = useTenantApi();
  const { user } = useAuth();
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const [studentId, setStudentId] = useState('');
  const [studentQ, setStudentQ] = useState('');
  const [rowStatus, setRowStatus] = useState<RowStatus>('all');

  const classesQuery = useQuery({
    queryKey: ['classes', t.slug],
    enabled: isStaff,
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });

  const staffQuery = useQuery({
    queryKey: ['gradebook', t.slug, classId],
    enabled: isStaff,
    queryFn: async () => (await t.get<StaffGradebook>(`/classes/${classId}/gradebook`)).data,
  });

  const mineQuery = useQuery({
    queryKey: ['gradebook-mine', t.slug, classId],
    enabled: !isStaff,
    queryFn: async () => (await t.get<StudentGradebook>(`/classes/${classId}/gradebook/mine`)).data,
  });

  const classOptions = useMemo(() => {
    const list = classesQuery.data ?? [];
    if (user?.role === 'teacher') {
      const mine = list.filter((c) => c.teacher?.id === user.id);
      return mine.length ? mine : list;
    }
    return list;
  }, [classesQuery.data, user]);

  const filteredRows = useMemo(() => {
    const data = staffQuery.data;
    if (!data) return [];
    const q = studentQ.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (studentId && row.student.id !== studentId) return false;
      if (q) {
        const hay = `${row.student.name} ${row.student.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const scores = [
        ...row.assignments.map((a) => a.grade),
        ...row.quizzes.map((qz) => qz.score),
      ];
      const hasAny = scores.some((s) => s != null);
      const hasMissing = scores.some((s) => s == null);
      if (rowStatus === 'has-grades' && !hasAny) return false;
      if (rowStatus === 'missing' && !hasMissing) return false;
      if (rowStatus === 'at-risk' && (row.percent == null || row.percent >= 50)) return false;
      return true;
    });
  }, [staffQuery.data, studentQ, studentId, rowStatus]);

  const chartBundle = useMemo(() => {
    const data = staffQuery.data;
    if (!data || filteredRows.length === 0) return null;
    const mode: 'student' | 'class' =
      studentId || filteredRows.length === 1 ? 'student' : 'class';
    return buildProgressSeries(data, filteredRows, mode);
  }, [staffQuery.data, filteredRows, studentId]);

  const staffStats = useMemo(() => {
    const data = staffQuery.data;
    if (!data) return null;
    const source = filteredRows.length ? filteredRows : data.rows;
    const percents = source.map((r) => r.percent).filter((p): p is number => p != null);
    const avgPct =
      percents.length > 0
        ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
        : null;
    let missing = 0;
    let scored = 0;
    for (const row of source) {
      for (const a of row.assignments) {
        if (a.grade == null) missing += 1;
        else scored += 1;
      }
      for (const q of row.quizzes) {
        if (q.score == null) missing += 1;
        else scored += 1;
      }
    }
    const atRisk = source.filter((r) => r.percent != null && r.percent < 50).length;
    return {
      students: data.rows.length,
      columns: data.assessments.length + data.quizzes.length,
      avg: avgPct,
      missing,
      scored,
      atRisk,
    };
  }, [staffQuery.data, filteredRows]);

  function exportCsv() {
    const data = staffQuery.data;
    if (!data) return;
    const headers = [
      'Student',
      'Email',
      ...data.assessments.map((a) => a.title),
      ...data.quizzes.map((q) => q.title),
      'Percent',
    ];
    const lines = filteredRows.map((row) => {
      const cells = [
        `"${row.student.name}"`,
        row.student.email,
        ...row.assignments.map((a) => (a.grade != null ? String(a.grade) : '')),
        ...row.quizzes.map((q) => (q.score != null ? String(q.score) : '')),
        row.percent != null ? String(row.percent) : '',
      ];
      return cells.join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook-${classId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isStaff) {
    if (staffQuery.isLoading) return <Spinner label="Loading gradebook..." />;
    if (staffQuery.isError) {
      return <ErrorBanner message="Could not load the gradebook. Try refreshing the page." />;
    }
    const data = staffQuery.data;
    if (!data) return <EmptyState message="Unable to load gradebook." />;

    const chartScope = chartBundle?.scopeLabel ?? 'Class';

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Grades</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {classTitle ? `${classTitle} · ` : ''}
              Assignment and quiz performance across the class
            </p>
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={filteredRows.length === 0}>
            <Icon name="note" width={16} height={16} />
            Export CSV
          </Button>
        </div>

        <Card className="!p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select
              label="Class"
              value={classId}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next !== classId) {
                  setStudentId('');
                  setStudentQ('');
                  navigate(`/${slug}/classes/${next}/grades`);
                }
              }}
            >
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
              {!classOptions.some((c) => c.id === classId) && classTitle && (
                <option value={classId}>{classTitle}</option>
              )}
            </Select>
            <Select
              label="Student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">All students</option>
              {data.rows.map((r) => (
                <option key={r.student.id} value={r.student.id}>
                  {r.student.name}
                </option>
              ))}
            </Select>
            <Input
              label="Search"
              placeholder="Filter by name or email…"
              value={studentQ}
              onChange={(e) => setStudentQ(e.target.value)}
            />
            <Select
              label="Show"
              value={rowStatus}
              onChange={(e) => setRowStatus(e.target.value as RowStatus)}
            >
              <option value="all">All students</option>
              <option value="has-grades">Has grades</option>
              <option value="missing">Missing scores</option>
              <option value="at-risk">At risk (&lt; 50%)</option>
            </Select>
          </div>
        </Card>

        {staffStats && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Students"
              value={staffStats.students}
              hint={`${filteredRows.length} in view`}
              icon="users"
              tone="bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300"
            />
            <StatTile
              label={studentId || filteredRows.length === 1 ? 'Overall' : 'Average'}
              value={staffStats.avg != null ? `${staffStats.avg}%` : '—'}
              hint={staffStats.atRisk ? `${staffStats.atRisk} at risk` : 'Based on graded work'}
              icon="chart"
              tone="bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
            />
            <StatTile
              label="Assessments"
              value={staffStats.columns}
              hint={`${data.assessments.length} assignments · ${data.quizzes.length} quizzes`}
              icon="quiz"
              tone="bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
            />
            <StatTile
              label="Missing scores"
              value={staffStats.missing}
              hint={`${staffStats.scored} recorded`}
              icon="note"
              tone="bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
            />
          </div>
        )}

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Progress charts</h3>
            <p className="text-xs text-slate-500">
              Showing {chartScope}
              {classTitle ? ` · ${classTitle}` : ''}
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartPanel
              title="Overall progress"
              subtitle="Quizzes + assignments (%)"
              points={chartBundle?.overall ?? []}
              color="#0d9488"
              emptyMessage="No graded work in this view yet."
            />
            <ChartPanel
              title="Quiz marks"
              subtitle="Quiz score progress (%)"
              points={chartBundle?.quizzes ?? []}
              color="#06b6d4"
              emptyMessage="No quiz scores in this view yet."
            />
            <ChartPanel
              title="Assignment marks"
              subtitle="Assignment grade progress (%)"
              points={chartBundle?.assignments ?? []}
              color="#059669"
              emptyMessage="No assignment grades in this view yet."
            />
          </div>
        </div>

        <Card className="overflow-hidden rounded-2xl !p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-white/5 dark:bg-white/5">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Gradebook</h3>
              <p className="text-xs text-slate-500">
                {filteredRows.length} student{filteredRows.length === 1 ? '' : 's'}
                {studentId || studentQ || rowStatus !== 'all' ? ' (filtered)' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ≥80%
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> 50–79%
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> &lt;50%
              </span>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState
                message={
                  data.rows.length === 0
                    ? 'No active students in this class yet.'
                    : 'No students match your filters.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-white text-xs uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-ink-850">
                    <th className="sticky left-0 z-10 bg-white px-5 py-3 font-semibold dark:bg-ink-850">
                      Student
                    </th>
                    {data.assessments.map((a) => (
                      <th key={a.id} className="whitespace-nowrap px-3 py-3 font-semibold">
                        <span className="block max-w-[9rem] truncate" title={a.title}>
                          {a.title}
                        </span>
                        <span className="mt-0.5 block font-normal normal-case text-slate-400">
                          Assignment{a.maxMarks != null ? ` · /${a.maxMarks}` : ''}
                        </span>
                      </th>
                    ))}
                    {data.quizzes.map((q) => (
                      <th key={q.id} className="whitespace-nowrap px-3 py-3 font-semibold">
                        <span className="block max-w-[9rem] truncate" title={q.title}>
                          {q.title}
                        </span>
                        <span className="mt-0.5 block font-normal normal-case text-slate-400">
                          Quiz · /{q.totalMarks}
                        </span>
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right font-semibold">Overall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.student.id}
                      className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                    >
                      <td className="sticky left-0 z-10 bg-white px-5 py-3 dark:bg-ink-850">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 text-left"
                          onClick={() =>
                            setStudentId((prev) => (prev === row.student.id ? '' : row.student.id))
                          }
                          title="Filter charts to this student"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                            {initials(row.student.name) || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 dark:text-white">
                              {row.student.name}
                            </p>
                            <p className="truncate text-xs text-slate-400">{row.student.email}</p>
                          </div>
                        </button>
                      </td>
                      {row.assignments.map((a) => (
                        <td key={a.assessmentId} className="px-3 py-3">
                          {scoreCell(a.grade, a.maxMarks)}
                        </td>
                      ))}
                      {row.quizzes.map((q) => (
                        <td key={q.quizId} className="px-3 py-3">
                          {scoreCell(q.score, q.totalMarks)}
                        </td>
                      ))}
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-flex min-w-[3.25rem] justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${percentTone(row.percent)}`}
                        >
                          {row.percent != null ? `${row.percent}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (mineQuery.isLoading) return <Spinner label="Loading your grades..." />;
  if (mineQuery.isError) {
    return <ErrorBanner message="Could not load your grades. Try refreshing the page." />;
  }
  const mine = mineQuery.data;
  if (!mine) return <EmptyState message="Unable to load your grades." />;

  const gradedAssignments = mine.assignments.filter((a) => a.grade != null);
  const takenQuizzes = mine.quizzes.filter((q) => q.score != null);
  const assignmentAvg =
    gradedAssignments.length > 0
      ? Math.round(
          (gradedAssignments.reduce((sum, a) => {
            if (a.maxMarks && a.maxMarks > 0 && a.grade != null) return sum + a.grade / a.maxMarks;
            return sum;
          }, 0) /
            gradedAssignments.length) *
            100
        )
      : null;
  const quizAvg =
    takenQuizzes.length > 0
      ? Math.round(
          (takenQuizzes.reduce((sum, q) => sum + (q.score! / Math.max(q.totalMarks, 1)), 0) /
            takenQuizzes.length) *
            100
        )
      : null;

  const studentAssignmentPoints: PerformancePoint[] = gradedAssignments.map((a) => ({
    label: a.title,
    percentage:
      a.maxMarks && a.maxMarks > 0 && a.grade != null
        ? Math.round((a.grade / a.maxMarks) * 100)
        : 0,
    score: a.grade ?? undefined,
    totalMarks: a.maxMarks ?? undefined,
  }));
  const studentQuizPoints: PerformancePoint[] = takenQuizzes.map((q) => ({
    label: q.title,
    percentage: Math.round(((q.score ?? 0) / Math.max(q.totalMarks, 1)) * 100),
    score: q.score ?? undefined,
    totalMarks: q.totalMarks,
  }));
  const studentOverall = [...studentAssignmentPoints, ...studentQuizPoints];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">My grades</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {classTitle ? `${classTitle} · ` : ''}Your assignment and quiz results
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Assignments"
          value={mine.assignments.length}
          hint={`${gradedAssignments.length} graded`}
          icon="note"
          tone="bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300"
        />
        <StatTile
          label="Quizzes"
          value={mine.quizzes.length}
          hint={`${takenQuizzes.length} taken`}
          icon="quiz"
          tone="bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
        />
        <StatTile
          label="Assignment avg"
          value={assignmentAvg != null ? `${assignmentAvg}%` : '—'}
          icon="chart"
          tone="bg-brand-100 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
        />
        <StatTile
          label="Quiz avg"
          value={quizAvg != null ? `${quizAvg}%` : '—'}
          icon="star"
          tone="bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartPanel
          title="Overall progress"
          subtitle="Your quizzes + assignments"
          points={studentOverall}
          color="#0d9488"
          emptyMessage="No graded work yet."
        />
        <ChartPanel
          title="Quiz marks"
          subtitle="Your quiz scores"
          points={studentQuizPoints}
          color="#06b6d4"
          emptyMessage="No quiz scores yet."
        />
        <ChartPanel
          title="Assignment marks"
          subtitle="Your assignment grades"
          points={studentAssignmentPoints}
          color="#059669"
          emptyMessage="No assignment grades yet."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl !p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-white/5 dark:bg-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white">Assignments</h3>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {mine.assignments.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">{a.title}</p>
                  {a.feedback && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{a.feedback}</p>
                  )}
                </div>
                {a.grade != null ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${percentTone(
                      a.maxMarks && a.maxMarks > 0 ? Math.round((a.grade / a.maxMarks) * 100) : null
                    )}`}
                  >
                    {a.grade}
                    {a.maxMarks != null ? ` / ${a.maxMarks}` : ''}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-medium text-slate-400">Not graded</span>
                )}
              </li>
            ))}
            {mine.assignments.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-slate-400">No assignments yet.</li>
            )}
          </ul>
        </Card>

        <Card className="overflow-hidden rounded-2xl !p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-white/5 dark:bg-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white">Quizzes</h3>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {mine.quizzes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <p className="min-w-0 truncate font-medium text-slate-900 dark:text-white">{q.title}</p>
                {q.score != null ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${percentTone(
                      Math.round((q.score / Math.max(q.totalMarks, 1)) * 100)
                    )}`}
                  >
                    {q.score} / {q.totalMarks}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-medium text-slate-400">Not taken</span>
                )}
              </li>
            ))}
            {mine.quizzes.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-slate-400">No quizzes yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
