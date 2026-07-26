import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import type { ClassSummary, VideoLesson, Notice, EventItem, AdminStats } from '../api/types';

type Tone = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'sky';

const toneChip: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-emerald-100 text-emerald-600',
  purple: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  pink: 'bg-pink-100 text-pink-600',
  sky: 'bg-sky-100 text-sky-600',
};

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
  return to ? <Link to={to}>{body}</Link> : body;
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-56 items-end gap-4 px-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{d.value}</span>
          <div className="flex w-full items-end justify-center">
            <div
              className="w-full max-w-[52px] rounded-t-lg transition-all"
              style={{ height: `${(d.value / max) * 170 + 6}px`, backgroundColor: d.color }}
            />
          </div>
          <span className="text-center text-xs text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const base = `/${slug}`;
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const classesQuery = useQuery({
    queryKey: ['classes', slug],
    queryFn: async () => (await t.get<{ classes: ClassSummary[] }>('/classes')).data.classes,
  });
  const videosQuery = useQuery({
    queryKey: ['video-lessons', slug],
    queryFn: async () => (await t.get<{ videos: VideoLesson[] }>('/video-lessons')).data.videos,
  });
  const noticesQuery = useQuery({
    queryKey: ['notices', slug],
    queryFn: async () => (await t.get<{ notices: Notice[] }>('/notices')).data.notices,
  });
  const eventsQuery = useQuery({
    queryKey: ['events', slug],
    queryFn: async () => (await t.get<{ events: EventItem[] }>('/events')).data.events,
  });
  const statsQuery = useQuery({
    queryKey: ['stats', slug],
    enabled: isStaff,
    queryFn: async () => (await t.get<{ stats: AdminStats }>('/stats')).data.stats,
  });

  const classes = classesQuery.data ?? [];
  const videos = videosQuery.data ?? [];
  const notices = noticesQuery.data ?? [];
  const events = eventsQuery.data ?? [];

  const overview = [
    { label: 'Classes', value: classes.length, color: '#2563eb' },
    { label: 'Videos', value: videos.length, color: '#8b5cf6' },
    { label: 'Notices', value: notices.length, color: '#10b981' },
    { label: 'Events', value: events.length, color: '#f59e0b' },
  ];

  if (isStaff) {
    const s = statsQuery.data;
    const dash = (n?: number) => (n === undefined ? '-' : n);
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Total Students" value={dash(s?.students)} icon="users" tone="blue" to={`${base}/students`} />
          <StatCard label="Total Teachers" value={dash(s?.teachers)} icon="teacher" tone="purple" to={`${base}/teachers`} />
          <StatCard label="Classes" value={dash(s?.classes)} icon="classes" tone="sky" to={`${base}/classes`} />
          <StatCard label="Enrollments" value={dash(s?.enrollments)} icon="note" tone="green" />
          <StatCard label="MCQ Exams" value={dash(s?.quizzes)} icon="quiz" tone="amber" to={`${base}/classes`} />
          <StatCard label="Exam Attempts" value={dash(s?.attempts)} icon="chart" tone="pink" />
          <StatCard label="Video Lessons" value={dash(s?.videos)} icon="videos" tone="purple" to={`${base}/videos`} />
          <StatCard label="Announcements" value={dash(s?.notices)} icon="notices" tone="green" to={`${base}/notices`} />
          <StatCard label="Events" value={dash(s?.events)} icon="events" tone="sky" to={`${base}/events`} />
          <StatCard label="Pending Payments" value={dash(s?.pendingPayments)} icon="payments" tone="amber" to={`${base}/payments`} />
          <StatCard
            label="Total Revenue"
            value={s ? `Rs. ${s.revenue.toLocaleString()}` : '-'}
            icon="revenue"
            highlight
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Content overview</h2>
            <p className="mb-4 text-sm text-slate-400">Published items across your institute</p>
            <BarChart data={overview} />
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Recent classes</h2>
            {classes.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {classes.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2.5">
                    <Link
                      to={`${base}/classes/${c.id}`}
                      className="truncate font-medium text-slate-800 hover:text-brand-600 dark:text-slate-200"
                    >
                      {c.title}
                    </Link>
                    <span className="ml-3 shrink-0 text-sm text-slate-400">
                      {c.price > 0 ? `Rs. ${c.price.toLocaleString()}` : 'Free'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No classes yet.</p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Student view
  const quickActions: { label: string; icon: IconName; to: string; tone: Tone }[] = [
    { label: 'My Classes', icon: 'classes', to: `${base}/classes`, tone: 'blue' },
    { label: 'Watch Videos', icon: 'play', to: `${base}/videos`, tone: 'purple' },
    { label: 'Submit Payment', icon: 'payments', to: `${base}/payments`, tone: 'pink' },
    { label: 'Read Announcements', icon: 'notices', to: `${base}/notices`, tone: 'green' },
    { label: 'Upcoming Events', icon: 'events', to: `${base}/events`, tone: 'amber' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 overflow-hidden rounded-2xl bg-hero-gradient p-6 text-white shadow-lg sm:flex-row sm:items-center sm:p-8">
        <div>
          <h2 className="text-2xl font-extrabold">Ready to learn?</h2>
          <p className="mt-1 text-slate-200">
            You're enrolled in {classes.length} {classes.length === 1 ? 'class' : 'classes'}. Keep the momentum going.
          </p>
        </div>
        <Link
          to={`${base}/classes`}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow transition hover:bg-slate-100"
        >
          Continue learning
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Library overview</h2>
          <p className="mb-4 text-sm text-slate-400">What's available to you right now</p>
          <BarChart data={overview} />
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Quick actions</h2>
          <div className="space-y-2">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 transition hover:border-brand-200 hover:bg-slate-50 dark:border-white/5 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${toneChip[a.tone]}`}>
                  <Icon name={a.icon} />
                </span>
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Classes" value={classes.length} icon="classes" tone="blue" to={`${base}/classes`} />
        <StatCard label="Videos" value={videos.length} icon="videos" tone="purple" to={`${base}/videos`} />
        <StatCard label="Announcements" value={notices.length} icon="notices" tone="green" to={`${base}/notices`} />
        <StatCard label="Events" value={events.length} icon="events" tone="amber" to={`${base}/events`} />
      </div>
    </div>
  );
}
