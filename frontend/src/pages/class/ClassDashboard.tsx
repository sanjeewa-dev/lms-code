import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Icon } from '../../components/icons';
import { useTenantApi } from '../../hooks/useTenantApi';
import { PerformanceChart, type PerformancePoint } from '../../components/PerformanceChart';
import type { ClassOutletContext } from '../ClassDetail';
import { type ClassSectionId } from './classSections';

const NEXT_ACTIONS: {
  section: ClassSectionId | null;
  to: (classBase: string, slug: string) => string;
  label: string;
  hint: string;
  icon: 'spark' | 'live' | 'note';
  tag: string;
}[] = [
  {
    section: 'quizzes',
    to: (classBase) => `${classBase}/quizzes?ai=1`,
    label: 'Generate a quiz',
    hint: 'Create an AI quiz for this class',
    icon: 'spark',
    tag: 'Quiz',
  },
  {
    section: 'schedule',
    to: (classBase) => `${classBase}/schedule`,
    label: 'Schedule / live',
    hint: 'Plan sessions or start a live class',
    icon: 'live',
    tag: 'Live',
  },
  {
    section: 'attendance',
    to: (classBase) => `${classBase}/attendance`,
    label: 'Take attendance',
    hint: 'Mark who joined today',
    icon: 'note',
    tag: 'Attendance',
  },
];

interface MaterialRow {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ScheduleRow {
  id: string;
  classDate: string;
  classTime: string;
  platform?: string;
  status?: string;
}

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
  }[];
  quizzes: { id: string; title: string; totalMarks: number; score: number | null }[];
};

const card =
  'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink-850';

export default function ClassDashboard() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { canManage, classBase, klass, isStudent } = useOutletContext<ClassOutletContext>();
  const t = useTenantApi();

  const materialsQuery = useQuery({
    queryKey: ['class-materials-preview', klass.id],
    queryFn: async () =>
      (await t.get<{ materials: MaterialRow[] }>(`/classes/${klass.id}/materials`)).data.materials,
  });

  const scheduleQuery = useQuery({
    queryKey: ['class-schedule-preview', klass.id],
    queryFn: async () =>
      (await t.get<{ schedules: ScheduleRow[] }>(`/classes/${klass.id}/schedules`)).data.schedules,
  });

  const staffGradeQuery = useQuery({
    queryKey: ['gradebook-hub', t.slug, klass.id],
    enabled: canManage,
    queryFn: async () => (await t.get<StaffGradebook>(`/classes/${klass.id}/gradebook`)).data,
  });

  const mineGradeQuery = useQuery({
    queryKey: ['gradebook-mine-hub', t.slug, klass.id],
    enabled: isStudent && !canManage,
    queryFn: async () => (await t.get<StudentGradebook>(`/classes/${klass.id}/gradebook/mine`)).data,
  });

  const materials = (materialsQuery.data ?? []).slice(0, 5);
  const upcoming = (scheduleQuery.data ?? [])
    .slice()
    .sort((a, b) => `${a.classDate}${a.classTime}`.localeCompare(`${b.classDate}${b.classTime}`))
    .slice(0, 4);

  const { progressPoints, averagePct } = useMemo(() => {
    if (canManage && staffGradeQuery.data) {
      const data = staffGradeQuery.data;
      const points: PerformancePoint[] = [];

      data.assessments.forEach((a, idx) => {
        const values: number[] = [];
        for (const row of data.rows) {
          const cell = row.assignments[idx];
          if (!cell || cell.grade == null) continue;
          const max = cell.maxMarks ?? a.maxMarks;
          if (max != null && max > 0) values.push((cell.grade / max) * 100);
        }
        if (values.length) {
          points.push({
            label: a.title,
            percentage: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
          });
        }
      });

      data.quizzes.forEach((q, idx) => {
        const values: number[] = [];
        for (const row of data.rows) {
          const cell = row.quizzes[idx];
          if (!cell || cell.score == null) continue;
          const max = cell.totalMarks || q.totalMarks || 1;
          values.push((cell.score / max) * 100);
        }
        if (values.length) {
          points.push({
            label: q.title,
            percentage: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
          });
        }
      });

      const percents = data.rows.map((r) => r.percent).filter((p): p is number => p != null);
      const averagePct =
        percents.length > 0
          ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
          : points.length
            ? Math.round(points.reduce((a, p) => a + p.percentage, 0) / points.length)
            : null;

      return { progressPoints: points, averagePct };
    }

    if (mineGradeQuery.data) {
      const mine = mineGradeQuery.data;
      const points: PerformancePoint[] = [
        ...mine.assignments
          .filter((a) => a.grade != null && a.maxMarks != null && a.maxMarks > 0)
          .map((a) => ({
            label: a.title,
            percentage: Math.round(((a.grade as number) / (a.maxMarks as number)) * 100),
          })),
        ...mine.quizzes
          .filter((q) => q.score != null)
          .map((q) => ({
            label: q.title,
            percentage: Math.round(((q.score as number) / Math.max(q.totalMarks, 1)) * 100),
          })),
      ];
      const averagePct = points.length
        ? Math.round(points.reduce((a, p) => a + p.percentage, 0) / points.length)
        : null;
      return { progressPoints: points, averagePct };
    }

    return { progressPoints: [] as PerformancePoint[], averagePct: null as number | null };
  }, [canManage, staffGradeQuery.data, mineGradeQuery.data]);

  function formatDay(iso: string) {
    try {
      const d = new Date(iso.slice(0, 10) + 'T12:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
    } catch {
      return iso.slice(0, 10);
    }
  }

  const gradesLoading =
    (canManage && staffGradeQuery.isLoading) || (isStudent && !canManage && mineGradeQuery.isLoading);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className={card}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Welcome</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {klass.description?.trim() ||
                `Your class hub for ${klass.title}. Open a section above for materials, quizzes, schedule, and more.`}
            </p>
          </div>

          <div className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white">Announcements</h2>
              <Link
                to={`/${slug}/notices`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                View All
              </Link>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-3 py-3 dark:bg-white/5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                <Icon name="notices" width={16} height={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Institute notices</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Check announcements for updates that apply to this class.
                </p>
              </div>
            </div>
          </div>

          <div className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white">Course materials</h2>
              <Link
                to={`${classBase}/materials`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                View All
              </Link>
            </div>
            {materialsQuery.isLoading ? (
              <p className="text-sm text-slate-400">Loading materials…</p>
            ) : materials.length === 0 ? (
              <p className="text-sm text-slate-400">No materials yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                      <Icon name="note" width={16} height={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.title}</p>
                      <p className="text-xs text-slate-400">
                        {(m.updatedAt || m.createdAt || '').slice(0, 10) || 'Material'}
                      </p>
                    </div>
                    <Link
                      to={`${classBase}/materials`}
                      className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white">Upcoming</h2>
              <Link
                to={`${classBase}/schedule`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                View Calendar
              </Link>
            </div>
            {scheduleQuery.isLoading ? (
              <p className="text-sm text-slate-400">Loading schedule…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming sessions.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex items-start gap-3">
                    <span className="w-14 shrink-0 text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                      {formatDay(s.classDate)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {s.classTime || 'Session'}
                      </p>
                      <span className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                        {s.status === 'live' ? 'Live' : s.platform || 'Schedule'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white">Class progress</h2>
              <Link
                to={`${classBase}/grades`}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                View Grades
              </Link>
            </div>
            {gradesLoading ? (
              <p className="text-sm text-slate-400">Loading progress…</p>
            ) : (
              <>
                <p className="text-3xl font-black tabular-nums text-brand-600 dark:text-brand-400">
                  {averagePct != null ? `${averagePct}%` : '—'}
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {averagePct != null
                    ? canManage
                      ? 'Average grade'
                      : 'Your average'
                    : 'No graded work yet'}
                </p>
                <div className="mt-3">
                  <PerformanceChart
                    points={progressPoints}
                    height={180}
                    color="#14b8a6"
                    emptyMessage="Complete quizzes or assignments to see the progress graph."
                  />
                </div>
              </>
            )}
          </div>

          {canManage && (
            <div className="rounded-2xl border border-brand-200/80 bg-brand-50 p-5 shadow-sm dark:border-brand-800/60 dark:bg-brand-950/40">
              <h2 className="font-bold text-slate-900 dark:text-white">What&apos;s next</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Common teaching tasks for this class.
              </p>
              <div className="mt-3 space-y-2">
                {NEXT_ACTIONS.map((action) => (
                  <Link
                    key={action.label}
                    to={action.to(classBase, slug)}
                    className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 transition hover:border-brand-300 dark:border-white/10 dark:bg-ink-850 dark:hover:border-brand-700"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                      <Icon name={action.icon} width={16} height={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        {action.label}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{action.hint}</span>
                    </span>
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
                      {action.tag}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
