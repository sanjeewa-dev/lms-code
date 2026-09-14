import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Icon } from './icons';
import { Badge, Card } from './ui';

export interface LiveSession {
  id: string;
  classDate: string;
  classTime: string;
  platform: string;
  status: string;
  class: { id: string; title: string; teacher: { name: string } };
}

function formatTime(classTime: string) {
  const [h, m] = classTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sessionSortKey(s: LiveSession) {
  return `${String(s.classDate).slice(0, 10)}T${s.classTime || '00:00'}`;
}

/** Live-now / up-next strip for all role dashboards. */
export function LiveNowStrip() {
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();
  const base = `/${slug}`;

  const query = useQuery({
    queryKey: ['live-upcoming', slug],
    queryFn: async () =>
      (await t.get<{ sessions: LiveSession[] }>('/live/upcoming')).data.sessions,
  });

  const sessions = query.data ?? [];
  const live = sessions.filter((s) => s.status === 'live');
  const upcoming = sessions
    .filter((s) => s.status !== 'live')
    .slice()
    .sort((a, b) => sessionSortKey(a).localeCompare(sessionSortKey(b)));
  const show = [...live, ...upcoming].slice(0, 4);

  if (query.isLoading || show.length === 0) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10">
            <Icon name="live" width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Live classes</p>
            <p className="text-xs text-slate-400">
              {query.isLoading ? 'Checking schedule…' : 'No upcoming live sessions'}
            </p>
          </div>
        </div>
        <Link
          to={`${base}/live`}
          className="rounded-full border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          Open Live Class
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Live classes</h2>
        <Link to={`${base}/live`} className="text-xs font-semibold text-brand-600 hover:underline">
          View all
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {show.map((s) => {
          const isLive = s.status === 'live';
          const teacherInitials = s.class.teacher.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join('');
          return (
            <div
              key={s.id}
              className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                {isLive ? <Badge tone="red">LIVE</Badge> : <Badge tone="green">Up next</Badge>}
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {teacherInitials || 'T'}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{s.class.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isLive
                  ? `with ${s.class.teacher.name}`
                  : `${String(s.classDate).slice(0, 10)} · ${formatTime(s.classTime)}`}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-400">{s.class.teacher.name}</span>
                <Link
                  to={`${base}/live`}
                  className="inline-flex rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Join
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
