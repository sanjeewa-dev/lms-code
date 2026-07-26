import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Badge, Card, Spinner } from '../components/ui';
import { Icon } from '../components/icons';

const platformLabel: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  google_meet: 'Google Meet',
};

function joinHref(text: string) {
  const url = text.trim();
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

export default function LiveClass() {
  const t = useTenantApi();
  const { slug } = useParams<{ slug: string }>();
  const base = `/${slug}`;

  const query = useQuery({
    queryKey: ['live-upcoming', t.slug],
    queryFn: async () =>
      (
        await t.get<{
          sessions: {
            id: string;
            classDate: string;
            classTime: string;
            platform: string;
            meetingText: string;
            class: { id: string; title: string; teacher: { name: string } };
          }[];
        }>('/live/upcoming')
      ).data.sessions,
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Class</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Upcoming scheduled sessions with meeting links
        </p>
      </div>

      {query.isLoading ? (
        <Spinner label="Loading sessions..." />
      ) : !query.data?.length ? (
        <Card>
          <p className="text-sm text-slate-500">
            No upcoming live sessions. Teachers can add schedules from a class&apos;s Schedule tab.
          </p>
          <Link to={`${base}/classes`} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to classes →
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {query.data.map((s) => {
            const dateStr = s.classDate.slice(0, 10);
            const isToday = dateStr === today;
            const href = joinHref(s.meetingText);
            return (
              <Card key={s.id} className={isToday ? 'border-brand-300 dark:border-brand-600' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-white">{s.class.title}</h2>
                      {isToday && <Badge tone="blue">Today</Badge>}
                      <Badge tone="slate">{platformLabel[s.platform] ?? s.platform}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {s.classTime} · {s.class.teacher.name}
                    </p>
                    {s.meetingText && !href && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                        {s.meetingText}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        <Icon name="live" />
                        Join now
                      </a>
                    )}
                    <Link
                      to={`${base}/classes/${s.class.id}?tab=schedule`}
                      className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      Class schedule
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
