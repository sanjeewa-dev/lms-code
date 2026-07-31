import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Icon } from './icons';

export interface CalendarSession {
  id: string;
  classDate: string;
  classTime: string;
  platform: string;
  status: string;
  class: { id: string; title: string; teacher: { name: string } };
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const platformShort: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Teams',
  google_meet: 'Meet',
  jitsi: 'Live',
};

function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

function formatTime(classTime: string) {
  const [h, m] = classTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, key });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DayHoverCard({
  dateKey,
  sessions,
  base,
  preferAbove,
  pinned,
}: {
  dateKey: string;
  sessions: CalendarSession[];
  base: string;
  preferAbove?: boolean;
  pinned?: boolean;
}) {
  return (
    <div
      className={`pointer-events-auto absolute left-1/2 z-40 w-56 -translate-x-1/2 ${
        preferAbove ? 'bottom-full pb-1' : 'top-full pt-1'
      }`}
    >
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl dark:border-white/10 dark:bg-ink-850">
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          {pinned && (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              Pinned
            </span>
          )}
        </div>
        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
          {sessions.map((s) => {
            const isLive = s.status === 'live';
            return (
              <li
                key={s.id}
                className={`rounded-lg border px-2 py-1.5 ${
                  isLive
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
                    : 'border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {s.class.title}
                  </p>
                  {isLive && (
                    <span className="shrink-0 text-[9px] font-bold text-red-600">LIVE</span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {formatTime(s.classTime)} · {s.class.teacher.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {platformShort[s.platform] ?? s.platform}
                </p>
                <div className="mt-1.5 flex gap-1">
                  {isLive && s.platform === 'jitsi' ? (
                    <Link
                      to={`${base}/live`}
                      className="rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
                    >
                      Join now
                    </Link>
                  ) : (
                    <Link
                      to={`${base}/classes/${s.class.id}/schedule`}
                      className="rounded-md bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-700"
                    >
                      Join now
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!pinned && (
          <p className="mt-2 text-center text-[9px] text-slate-400">Click date to keep open</p>
        )}
      </div>
    </div>
  );
}

export function ClassCalendar() {
  const t = useTenantApi();
  const { slug } = useParams<{ slug: string }>();
  const base = `/${slug}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['live-upcoming', t.slug, 'calendar'],
    queryFn: async () =>
      (await t.get<{ sessions: CalendarSession[] }>('/live/upcoming')).data.sessions,
  });

  const sessions = sessionsQuery.data ?? [];

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const key = toDateKey(String(s.classDate));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [sessions]);

  const cells = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor.year, cursor.month]);

  const goPrev = () => {
    setPinnedKey(null);
    setHoveredKey(null);
    setCursor((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }
    );
  };
  const goNext = () => {
    setPinnedKey(null);
    setHoveredKey(null);
    setCursor((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }
    );
  };

  return (
    <div className="w-full max-w-[280px] overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-3 py-2.5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-100 text-pink-600">
            <Icon name="live" width={14} height={14} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Calendar</h2>
            <p className="text-[10px] text-slate-400">Hover or click a day</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Icon name="chevron" width={12} height={12} className="rotate-180" />
          </button>
          <span className="min-w-[72px] text-center text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            {monthLabel(cursor.year, cursor.month)}
          </span>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Icon name="chevron" width={12} height={12} />
          </button>
        </div>
      </div>

      <div className="p-2.5">
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="py-0.5 text-center text-[9px] font-semibold text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} className="h-7" />;

            const daySessions = byDate.get(cell.key) ?? [];
            const hasSessions = daySessions.length > 0;
            const isToday = cell.key === todayKey;
            const isPinned = pinnedKey === cell.key;
            const isOpen =
              hasSessions && (isPinned || (!pinnedKey && hoveredKey === cell.key));
            const hasLive = daySessions.some((s) => s.status === 'live');
            const preferAbove = i >= cells.length - 14;

            return (
              <div
                key={cell.key}
                className="relative"
                onMouseEnter={() => {
                  if (hasSessions) setHoveredKey(cell.key);
                }}
                onMouseLeave={() => {
                  // Keep open while pinned; only clear hover preview
                  setHoveredKey((k) => (k === cell.key ? null : k));
                }}
              >
                <button
                  type="button"
                  disabled={!hasSessions}
                  onClick={() => {
                    if (!hasSessions) return;
                    setPinnedKey((k) => (k === cell.key ? null : cell.key));
                  }}
                  className={`flex h-7 w-full flex-col items-center justify-center rounded-md text-[11px] font-medium transition ${
                    isPinned
                      ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                      : isToday
                        ? 'bg-brand-600 text-white'
                        : hasSessions
                          ? 'cursor-pointer bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-200 dark:hover:bg-brand-900/50'
                          : 'cursor-default text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {cell.day}
                  {hasSessions && (
                    <span className="mt-px flex gap-px">
                      {daySessions.slice(0, 2).map((s) => (
                        <span
                          key={s.id}
                          className={`h-0.5 w-0.5 rounded-full ${
                            isPinned || isToday
                              ? 'bg-white'
                              : s.status === 'live'
                                ? 'bg-red-500'
                                : 'bg-brand-500'
                          }`}
                        />
                      ))}
                    </span>
                  )}
                  {hasLive && !isToday && !isPinned && (
                    <span className="absolute right-0.5 top-0.5 h-1 w-1 animate-pulse rounded-full bg-red-500" />
                  )}
                </button>

                {isOpen && (
                  <DayHoverCard
                    dateKey={cell.key}
                    sessions={daySessions}
                    base={base}
                    preferAbove={preferAbove}
                    pinned={isPinned}
                  />
                )}
              </div>
            );
          })}
        </div>
        {sessionsQuery.isLoading && (
          <p className="mt-2 text-center text-[10px] text-slate-400">Loading…</p>
        )}
        {!sessionsQuery.isLoading && sessions.length === 0 && (
          <p className="mt-2 text-center text-[10px] text-slate-400">No upcoming classes</p>
        )}
      </div>
    </div>
  );
}
