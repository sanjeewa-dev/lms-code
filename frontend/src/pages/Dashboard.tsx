import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Card, ErrorBanner } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import { AtRiskPanel } from '../components/AtRiskPanel';
import { SmartOpsPanel, WeakTopicsCard } from '../components/SmartOpsPanel';
import { PerformanceChart, type PerformancePoint } from '../components/PerformanceChart';
import { ClassCalendar } from '../components/ClassCalendar';
import { LiveNowStrip } from '../components/LiveNowStrip';
import { currentMonth } from '../lib/paymentUtils';
import type { ClassSummary, AdminStats } from '../api/types';

type Tone = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'sky';

const toneChip: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  green: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  purple: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  pink: 'bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300',
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
};

function WelcomeBanner({
  eyebrow,
  title,
  description,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primary: { to: string; label: string };
  secondary: { to: string; label: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-r from-teal-50 via-white to-cyan-50 p-5 shadow-sm dark:border-white/5 dark:from-ink-850 dark:via-ink-850 dark:to-ink-850 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-200/45 blur-3xl dark:bg-teal-500/10" />
      <div className="pointer-events-none absolute -bottom-24 left-[28%] h-48 w-48 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-500/10" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          <Link
            to={primary.to}
            className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700"
          >
            {primary.label}
          </Link>
          <Link
            to={secondary.to}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
          >
            {secondary.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
  to,
  highlight = false,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  tone?: Tone;
  to?: string;
  highlight?: boolean;
}) {
  const body = (
    <div
      className={`flex items-start justify-between rounded-2xl border p-5 shadow-sm transition ${
        highlight
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-md dark:border-white/5 dark:bg-ink-850'
      }`}
    >
      <div>
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            highlight ? 'text-white/80' : 'text-slate-400'
          }`}
        >
          {label}
        </p>
        <p className={`mt-2 text-3xl font-extrabold ${highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
          {value}
        </p>
      </div>
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          highlight ? 'bg-white/20 text-white' : toneChip[tone]
        }`}
      >
        <Icon name={icon} />
      </span>
    </div>
  );
  return to ? (
    <Link to={to} className="block self-start">
      {body}
    </Link>
  ) : (
    body
  );
}

function ShortcutTile({
  to,
  title,
  hint,
  icon,
  tone = 'purple',
}: {
  to: string;
  title: string;
  hint: string;
  icon: IconName;
  tone?: Tone;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-white/5 dark:bg-ink-850 dark:hover:border-brand-700/40"
    >
      <span
        className={`mb-3 grid h-10 w-10 place-items-center rounded-xl transition group-hover:scale-105 ${toneChip[tone]}`}
      >
        <Icon name={icon} width={18} height={18} />
      </span>
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </Link>
  );
}

interface StudentTodo {
  continueClass: { id: string; title: string } | null;
  pendingQuizzes: {
    id: string;
    title: string;
    classId: string;
    classTitle: string;
    questionCount: number;
    timeLimitSec: number;
    totalMarks: number;
  }[];
  recentAttempt: {
    id: string;
    score: number | null;
    totalMarks: number;
    quizTitle: string;
    quizId: string;
    classId: string;
    submittedAt: string | null;
  } | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const base = `/${slug}`;
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const isStaff = isAdmin || isTeacher;
  const isStudent = user?.role === 'student';

  const classesQuery = useQuery({
    queryKey: ['classes', slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });
  const statsQuery = useQuery({
    queryKey: ['stats', slug],
    enabled: isStaff,
    queryFn: async () => (await t.get<{ stats: AdminStats }>('/stats')).data.stats,
  });
  const chatUnreadQuery = useQuery({
    queryKey: ['chat-unread', slug],
    queryFn: async () => (await t.get<{ count: number }>('/chat/unread-count')).data.count,
  });
  const atRiskQuery = useQuery({
    queryKey: ['at-risk', slug],
    enabled: isStaff,
    queryFn: async () =>
      (await t.get<{ students: unknown[] }>('/smart/at-risk')).data.students,
  });
  const performanceQuery = useQuery({
    queryKey: ['performance-mine', slug],
    enabled: isStudent,
    queryFn: async () =>
      (await t.get<{ points: PerformancePoint[] }>('/performance/mine')).data.points,
  });
  const todoQuery = useQuery({
    queryKey: ['me-todo', slug],
    enabled: isStudent,
    queryFn: async () => (await t.get<{ todo: StudentTodo }>('/me/todo')).data.todo,
  });
  const aiQuotaQuery = useQuery({
    queryKey: ['ai-quota-dash', slug],
    enabled: isStudent,
    queryFn: async () => {
      const classes = (await t.get<{ classes: { classId: string }[] }>('/ai/classes')).data.classes;
      if (!classes?.length) return null;
      const { data } = await t.get<{
        quota: { used: number; limit: number; remaining: number };
      }>(`/ai/quota?classId=${encodeURIComponent(classes[0].classId)}`);
      return data.quota;
    },
    retry: false,
  });

  const classes = classesQuery.data ?? [];
  const s = statsQuery.data;
  const dash = (n?: number) => (n === undefined ? '—' : n);
  const chatUnread = chatUnreadQuery.data ?? 0;
  const quizGenHref = classes[0]
    ? `${base}/classes/${classes[0].id}/quizzes?ai=1`
    : `${base}/classes`;
  const quizGenHint = 'Open a class → Quizzes → AI generate';

  if (isAdmin) {
    const firstName = user?.name?.split(' ')[0] ?? 'Admin';

    return (
      <div className="space-y-6">
        {statsQuery.isError && (
          <ErrorBanner message="Could not load dashboard stats. Try refreshing the page." />
        )}

        <WelcomeBanner
          eyebrow="Institute overview"
          title={`Welcome back, ${firstName}`}
          description="Monitor students, fees, and live sessions — then jump into teaching tools."
          primary={{ to: `${base}/classes`, label: 'Manage classes' }}
          secondary={{ to: `${base}/students`, label: 'View students' }}
        />

        {statsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/5 dark:bg-ink-850"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Students" value={dash(s?.students)} icon="users" tone="blue" to={`${base}/students`} />
            <StatCard
              label="Pending payments"
              value={dash(s?.pendingPayments)}
              icon="payments"
              tone="amber"
              to={`${base}/payments`}
              highlight={(s?.pendingPayments ?? 0) > 0}
            />
            <StatCard
              label="Open interventions"
              value={dash(s?.openInterventions)}
              icon="note"
              tone="pink"
              to={`${base}/interventions`}
            />
            <StatCard
              label="Live today"
              value={dash(s?.liveTodayCount)}
              icon="live"
              tone="green"
              to={`${base}/live`}
            />
            <StatCard
              label="This month's revenue"
              value={s ? `Rs. ${s.revenue.toLocaleString()}` : '—'}
              icon="revenue"
              highlight
              to={`${base}/payments?status=approved&forMonth=${currentMonth()}`}
            />
          </div>
        )}

        <LiveNowStrip />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ShortcutTile
            to={`${base}/ai-copilot`}
            title="AI Copilot"
            hint="Quiz gen, feedback, weak topics"
            icon="spark"
            tone="purple"
          />
          <ShortcutTile
            to={quizGenHref}
            title="Generate quiz"
            hint={quizGenHint}
            icon="quiz"
            tone="amber"
          />
          <ShortcutTile
            to={`${base}/chat`}
            title="Chat"
            hint={chatUnread ? `${chatUnread} unread` : 'Message teachers & students'}
            icon="chat"
            tone="sky"
          />
          <ShortcutTile
            to={`${base}/interventions`}
            title="Interventions"
            hint={`${s?.openInterventions ?? 0} open follow-ups`}
            icon="note"
            tone="pink"
          />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <AtRiskPanel compact />
          <SmartOpsPanel />
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ClassCalendar size="full" />
          </div>
          <Card className="flex h-full flex-col lg:col-span-7">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent classes</h2>
                <p className="text-sm text-slate-400">Jump back into class hubs</p>
              </div>
              <Link
                to={`${base}/classes`}
                className="shrink-0 text-sm font-semibold text-brand-600 hover:underline"
              >
                View all
              </Link>
            </div>
            {classes.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {classes.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`${base}/classes/${c.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80 dark:hover:bg-white/5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                          <Icon name="classes" width={16} height={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                            {c.title}
                          </p>
                          {c.batch?.name && (
                            <p className="truncate text-xs text-slate-400">{c.batch.name}</p>
                          )}
                        </div>
                      </div>
                      <Icon name="chevron" width={14} height={14} className="shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center dark:border-white/10 dark:bg-white/5">
                <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                  <Icon name="classes" />
                </span>
                <p className="font-medium text-slate-700 dark:text-slate-200">No classes yet</p>
                <p className="mt-1 max-w-xs text-sm text-slate-400">
                  Create your first class to start enrollments, quizzes, and live sessions.
                </p>
                <Link
                  to={`${base}/classes`}
                  className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Create a class
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  if (isTeacher) {
    const myClasses = classes.filter((c) => c.teacher?.id === user?.id);
    const teachingList = myClasses.length ? myClasses : classes;
    const teacherQuizHref = teachingList[0]
      ? `${base}/classes/${teachingList[0].id}/quizzes?ai=1`
      : `${base}/classes`;

    return (
      <div className="space-y-6">
        <WelcomeBanner
          eyebrow="Teaching today"
          title={teachingList[0]?.title ?? 'Your classes'}
          description={`${dash(s?.students)} students · ${dash(s?.classes)} classes · ${dash(s?.draftQuizzes)} draft quizzes`}
          primary={{
            to: teachingList[0] ? `${base}/classes/${teachingList[0].id}` : `${base}/classes`,
            label: teachingList[0] ? 'Open class hub' : 'Manage classes',
          }}
          secondary={{ to: teacherQuizHref, label: 'AI quiz builder' }}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="My students" value={dash(s?.students)} icon="users" tone="blue" to={`${base}/students`} />
          <StatCard label="My classes" value={dash(s?.classes)} icon="classes" tone="sky" to={`${base}/classes`} />
          <StatCard
            label="Open interventions"
            value={dash(s?.openInterventions)}
            icon="note"
            tone="pink"
            to={`${base}/interventions`}
          />
          <StatCard label="Live today" value={dash(s?.liveTodayCount)} icon="live" tone="green" to={`${base}/live`} />
          <StatCard label="Draft quizzes" value={dash(s?.draftQuizzes)} icon="quiz" tone="amber" to={`${base}/classes`} />
          <StatCard label="Unread chat" value={chatUnread} icon="chat" tone="purple" to={`${base}/chat`} />
        </div>

        <LiveNowStrip />

        <div className="grid gap-6 lg:grid-cols-2">
          <AtRiskPanel compact />
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Needs attention</h2>
            <p className="mb-4 text-sm text-slate-400">Follow-ups and AI teaching shortcuts.</p>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-300">At risk</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {atRiskQuery.data?.length ?? '—'}
                </p>
                <p className="text-xs text-slate-500">flagged students</p>
              </div>
              <div className="rounded-xl border border-brand-100 bg-brand-50/80 p-3 dark:border-brand-900/30 dark:bg-brand-950/20">
                <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">Follow-ups</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{dash(s?.openInterventions)}</p>
                <p className="text-xs text-slate-500">open interventions</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ShortcutTile
                to={teacherQuizHref}
                title="Quiz generator"
                hint="Open a class → Quizzes → AI generate"
                icon="quiz"
                tone="amber"
              />
              <ShortcutTile
                to={`${base}/ai-copilot?tool=feedback`}
                title="Feedback drafter"
                hint="Grade comments with AI"
                icon="note"
                tone="green"
              />
              <ShortcutTile
                to={`${base}/ai-copilot?tool=weak-topics`}
                title="Weak topics"
                hint="Class-wide quiz gaps"
                icon="chart"
                tone="pink"
              />
              <ShortcutTile
                to={`${base}/ai-copilot?tool=intervention`}
                title="Intervention radar"
                hint="AI suggestions for at-risk"
                icon="spark"
                tone="purple"
              />
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ClassCalendar />
          </div>
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">My classes</h2>
            {teachingList.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {teachingList.slice(0, 8).map((c) => (
                  <li key={c.id} className="py-2.5">
                    <Link
                      to={`${base}/classes/${c.id}`}
                      className="font-medium text-slate-800 hover:text-brand-600 dark:text-slate-200"
                    >
                      {c.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <Link to={`${base}/classes/${c.id}/quizzes`} className="text-brand-600 hover:underline">
                        Quizzes
                      </Link>
                      <Link to={`${base}/classes/${c.id}/students`} className="text-sky-600 hover:underline">
                        Students
                      </Link>
                      <Link to={`${base}/classes/${c.id}/attendance`} className="text-amber-600 hover:underline">
                        Attendance
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No classes assigned yet.</p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Student view
  const todo = todoQuery.data;
  const continueClass = todo?.continueClass ?? (classes[0] ? { id: classes[0].id, title: classes[0].title } : null);
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const pendingCount = todo?.pendingQuizzes?.length ?? 0;

  return (
    <div className="space-y-6">
      <WelcomeBanner
        eyebrow="Student dashboard"
        title={continueClass ? `Continue ${continueClass.title}` : `Welcome back, ${firstName}`}
        description={
          pendingCount
            ? `${pendingCount} quiz${pendingCount === 1 ? '' : 'zes'} waiting for you.`
            : `You're enrolled in ${classes.length} ${classes.length === 1 ? 'class' : 'classes'}.`
        }
        primary={{
          to: continueClass ? `${base}/classes/${continueClass.id}` : `${base}/classes`,
          label: 'Continue learning',
        }}
        secondary={{ to: `${base}/ai`, label: 'Open AI Area' }}
      />

      <LiveNowStrip />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ShortcutTile
          to={continueClass ? `${base}/classes/${continueClass.id}` : `${base}/classes`}
          title={continueClass ? 'Continue class' : 'Browse classes'}
          hint={continueClass?.title ?? 'Find a class to join'}
          icon="classes"
          tone="blue"
        />
        <ShortcutTile
          to={
            todo?.pendingQuizzes?.[0]
              ? `${base}/quizzes/${todo.pendingQuizzes[0].id}/take`
              : `${base}/classes`
          }
          title="Quizzes"
          hint={pendingCount ? `${pendingCount} due` : 'No quizzes due'}
          icon="quiz"
          tone="amber"
        />
        <ShortcutTile
          to={`${base}/live`}
          title="Join live"
          hint="Live class room"
          icon="live"
          tone="green"
        />
        <ShortcutTile
          to={`${base}/ai?tool=tutor`}
          title="AI tutor"
          hint="Ask questions anytime"
          icon="spark"
          tone="purple"
        />
        <ShortcutTile
          to={`${base}/chat`}
          title="Chat"
          hint={chatUnread ? `${chatUnread} unread` : 'Message your class'}
          icon="chat"
          tone="sky"
        />
        <ShortcutTile
          to={`${base}/payments`}
          title="Pay fees"
          hint="Upload slips or pay online"
          icon="payments"
          tone="pink"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <WeakTopicsCard />
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI study hub</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {aiQuotaQuery.data
                  ? `${aiQuotaQuery.data.remaining} of ${aiQuotaQuery.data.limit} AI tokens left this month`
                  : 'Tutor, flashcards, and study plans in one place'}
              </p>
            </div>
            <Link
              to={`${base}/ai`}
              className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Open AI Area
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(
              [
                ['tutor', 'Tutor'],
                ['flashcards', 'Flashcards'],
                ['study-plan', 'Study plan'],
              ] as const
            ).map(([tool, label]) => (
              <Link
                key={tool}
                to={`${base}/ai?tool=${tool}`}
                className="rounded-xl border border-slate-200 px-2 py-3 text-center text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              >
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ClassCalendar size="full" />
        </div>
        <Card className="flex h-full flex-col lg:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                <Icon name="quiz" width={18} height={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Due quizzes</h2>
                <p className="text-sm text-slate-400">Published quizzes you have not finished</p>
              </div>
            </div>
          </div>
          {todoQuery.isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : todo?.pendingQuizzes?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {todo.pendingQuizzes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{q.title}</p>
                    <p className="text-xs text-slate-400">
                      {q.classTitle} · {q.questionCount} questions
                      {q.timeLimitSec > 0 ? ` · ${Math.round(q.timeLimitSec / 60)} min` : ''}
                    </p>
                  </div>
                  <Link
                    to={`${base}/quizzes/${q.id}/take`}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Start
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center dark:border-white/10 dark:bg-white/5">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                <Icon name="quiz" />
              </span>
              <p className="font-medium text-slate-700 dark:text-slate-200">No pending quizzes</p>
              <p className="mt-1 text-sm text-slate-400">You&apos;re all caught up. Nice work.</p>
            </div>
          )}

          {todo?.recentAttempt && (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase text-slate-400">Recent score</p>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {todo.recentAttempt.quizTitle}:{' '}
                <strong>
                  {todo.recentAttempt.score ?? 0}/{todo.recentAttempt.totalMarks}
                </strong>
              </p>
              <Link
                to={`${base}/attempts/${todo.recentAttempt.id}/result`}
                className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline"
              >
                Review & explain with AI
              </Link>
            </div>
          )}
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Icon name="chart" width={18} height={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Performance</h2>
              <p className="text-sm text-slate-400">Quiz and assignment scores over time (0–100%)</p>
            </div>
          </div>
          {performanceQuery.isLoading ? (
            <div className="flex h-56 items-center justify-center text-sm text-slate-400">Loading marks…</div>
          ) : (
            <PerformanceChart points={performanceQuery.data ?? []} />
          )}
        </Card>

        <Card className="lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">My classes</h2>
              <p className="text-sm text-slate-400">Jump back into class hubs</p>
            </div>
            <Link to={`${base}/classes`} className="text-sm font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {classes.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {classes.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link
                    to={`${base}/classes/${c.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80 dark:hover:bg-white/5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                        <Icon name="classes" width={16} height={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800 dark:text-slate-100">{c.title}</p>
                        {c.teacher?.name && (
                          <p className="truncate text-xs text-slate-400">{c.teacher.name}</p>
                        )}
                      </div>
                    </div>
                    <Icon name="chevron" width={14} height={14} className="shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center dark:border-white/10 dark:bg-white/5">
              <p className="font-medium text-slate-700 dark:text-slate-200">No classes yet</p>
              <p className="mt-1 text-sm text-slate-400">Browse published classes to get started.</p>
              <Link
                to={`${base}/classes`}
                className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Browse classes
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
