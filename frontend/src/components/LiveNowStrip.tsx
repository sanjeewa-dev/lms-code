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
  const next = live[0] ?? upcoming[0];

  if (query.isLoading || !next) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10">
            <Icon name="live" width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Live class</p>
            <p className="text-xs text-slate-400">
              {query.isLoading ? 'Checking schedule…' : 'No upcoming live sessions'}
            </p>
          </div>
        </div>
        <Link
          to={`${base}/live`}
          className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Open Live Class
        </Link>
      </Card>
    );
  }

  const isLive = next.status === 'live';

  return (
    <Card
      className={`flex flex-wrap items-center justify-between gap-3 ${
        isLive ? 'border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            isLive ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-600'
          }`}
        >
          <Icon name="live" width={18} height={18} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{next.class.title}</p>
            {isLive ? <Badge tone="red">Live now</Badge> : <Badge tone="green">Up next</Badge>}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isLive
              ? `with ${next.class.teacher.name}`
              : `${String(next.classDate).slice(0, 10)} · ${formatTime(next.classTime)} · ${next.class.teacher.name}`}
            {live.length + upcoming.length > 1 ? ` · +${live.length + upcoming.length - 1} more` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`${base}/live`}
          className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white ${
            isLive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {isLive ? 'Join now' : 'View schedule'}
        </Link>
      </div>
    </Card>
  );
}
