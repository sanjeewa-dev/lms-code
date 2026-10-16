import { useState, type ReactNode } from 'react';
import type {
  CohortLeaderboardResponse,
  CohortPerformer,
  CohortScoreDistributionResponse,
  TopicAggregateRow,
} from '../../api/quizAnalytics.types';

export function Metric({
  label,
  value,
  accent,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
      )}
      {onClick && (
        <p className="mt-2 text-[10px] font-medium text-brand-600 dark:text-brand-400">
          Click to view students
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-ink-850 dark:hover:border-brand-500/40"
      >
        {body}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-850">
      {body}
    </div>
  );
}

export type AnalyticsTab = 'classes' | 'quizzes' | 'students';

export function AnalyticsTabBar({
  value,
  onChange,
}: {
  value: AnalyticsTab;
  onChange: (next: AnalyticsTab) => void;
}) {
  const tabs: Array<{
    id: AnalyticsTab;
    label: string;
    description: string;
    iconPath: string;
    accent: string;
  }> = [
    {
      id: 'classes',
      label: 'Classes Analysis',
      description: 'Class trends, engagement, and top performers',
      iconPath:
        'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z',
      accent: 'brand',
    },
    {
      id: 'quizzes',
      label: 'Quizzes Analysis',
      description: 'Quiz results, score distribution, and submission funnel',
      iconPath:
        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      accent: 'teal',
    },
    {
      id: 'students',
      label: 'Students Analysis',
      description: 'Cohort overview, roster engagement, and student profiles',
      iconPath:
        'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      accent: 'sky',
    },
  ];

  const accentStyles: Record<string, { icon: string; ring: string; bar: string }> = {
    brand: {
      icon: 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
      ring: 'ring-brand-500/30',
      bar: 'bg-brand-600',
    },
    teal: {
      icon: 'bg-teal-50 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
      ring: 'ring-teal-500/30',
      bar: 'bg-teal-600',
    },
    sky: {
      icon: 'bg-sky-50 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
      ring: 'ring-sky-500/30',
      bar: 'bg-sky-600',
    },
  };

  return (
    <nav aria-label="Analytics sections" className="w-full">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Choose analysis view
      </p>
      <div role="tablist" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {tabs.map((t) => {
          const active = value === t.id;
          const accent = accentStyles[t.accent]!;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={`group relative flex w-full flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:p-5 dark:focus-visible:ring-offset-ink-900 ${
                active
                  ? `border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white shadow-md ring-2 ${accent.ring} dark:border-brand-500/40 dark:from-brand-500/10 dark:via-ink-850 dark:to-ink-850`
                  : 'border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-white/10 dark:bg-ink-850 dark:hover:border-brand-500/30'
              }`}
            >
              {active && (
                <span
                  className={`absolute inset-x-4 top-0 h-1 rounded-b-full ${accent.bar}`}
                  aria-hidden
                />
              )}
              <div className="flex w-full items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                    active
                      ? accent.icon
                      : 'bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-white/5 dark:text-slate-400 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-400'
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.iconPath} />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-bold sm:text-base ${
                        active
                          ? 'text-brand-950 dark:text-brand-100'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {t.label}
                    </span>
                    {active ? (
                      <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Active
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-600 opacity-0 transition group-hover:opacity-100 dark:text-brand-400">
                        Open →
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 text-xs leading-relaxed ${
                      active
                        ? 'text-brand-900/70 dark:text-brand-200/70'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-ink-850">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

type PerformanceView = 'top' | 'bottom';

export function CohortPerformanceBlock({
  data,
  loading,
}: {
  data: CohortLeaderboardResponse | null;
  loading: boolean;
}) {
  const [view, setView] = useState<PerformanceView>('top');
  if (loading && !data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        Loading performers…
      </div>
    );
  }
  if (!data || data.totalPerformers === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-white/10 dark:bg-white/5">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No graded submissions
          {data?.scope === 'single_assessment' ? ' for this quiz' : ''} yet.
        </p>
      </div>
    );
  }
  const cap = data.size;
  const performers = view === 'top' ? data.top : data.bottom;
  return (
    <div className="relative space-y-3">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 text-xs font-medium text-slate-500 backdrop-blur-[1px] dark:bg-ink-850/70 dark:text-slate-400">
          Updating…
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {view === 'top' ? 'Top' : 'Bottom'} {Math.min(performers.length, cap)} of {data.totalPerformers}{' '}
          graded {data.totalPerformers === 1 ? 'submission' : 'submissions'}.
        </p>
        <PerformanceViewToggle value={view} onChange={setView} cap={cap} />
      </div>
      <CohortPerformerList
        title={view === 'top' ? `Top ${cap}` : `Bottom ${cap}`}
        performers={performers}
        tone={view === 'top' ? 'up' : 'down'}
      />
    </div>
  );
}

function PerformanceViewToggle({
  value,
  onChange,
  cap,
}: {
  value: PerformanceView;
  onChange: (next: PerformanceView) => void;
  cap: number;
}) {
  const options: Array<{ id: PerformanceView; label: string }> = [
    { id: 'top', label: `Top ${cap}` },
    { id: 'bottom', label: `Bottom ${cap}` },
  ];
  return (
    <div
      role="tablist"
      aria-label="Performers view"
      className="inline-flex flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-white/5"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-3 py-1 font-medium transition ${
              active
                ? 'border border-slate-200 bg-white text-brand-700 shadow-sm dark:border-white/10 dark:bg-ink-850 dark:text-brand-300'
                : 'text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CohortPerformerList({
  title,
  performers,
  tone,
}: {
  title: string;
  performers: CohortPerformer[];
  tone: 'up' | 'down' | 'attention';
}) {
  const arrowPath = tone === 'up' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7';
  const arrowClass =
    tone === 'up' ? 'text-emerald-600' : tone === 'attention' ? 'text-orange-600' : 'text-amber-600';
  const badgeClass =
    tone === 'up'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : tone === 'attention'
        ? 'bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300'
        : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 dark:border-white/10 dark:bg-white/5">
      <div className="mb-2.5 flex items-center gap-2">
        <svg className={`h-4 w-4 ${arrowClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={arrowPath} />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          {title}
        </p>
      </div>
      {performers.length === 0 ? (
        <p className="text-xs italic text-slate-500 dark:text-slate-400">No results.</p>
      ) : (
        <ol className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {(() => {
            // Competition ranking on the already-sorted list: ties share a rank,
            // and the next distinct score resumes at its row position (1, 1, 3).
            let lastScore: number | null = null;
            let lastRank = 0;
            return performers.map((p, idx) => {
              const rank = p.scorePercent === lastScore ? lastRank : idx + 1;
              lastScore = p.scorePercent;
              lastRank = rank;
              return (
                <li
                  key={`${p.studentId}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-ink-850"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {p.studentName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {p.papersGraded > 1
                          ? `Avg across ${p.papersGraded} quizzes`
                          : p.rollNumber
                            ? `Student ID ${p.rollNumber}`
                            : '—'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded px-2 py-1 text-xs font-semibold tabular-nums ${badgeClass}`}
                  >
                    {p.scorePercent}%
                  </span>
                </li>
              );
            });
          })()}
        </ol>
      )}
    </div>
  );
}

export function CohortScoreDistributionBlock({
  data,
  loading,
}: {
  data: CohortScoreDistributionResponse | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        Loading distribution…
      </div>
    );
  }
  if (!data || data.gradedCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-white/10 dark:bg-white/5">
        <p className="text-sm text-slate-500 dark:text-slate-400">No graded submissions yet.</p>
      </div>
    );
  }
  const maxCount = Math.max(1, ...data.bands.map((b) => b.count));
  return (
    <div className="relative space-y-5">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 text-xs font-medium text-slate-500 backdrop-blur-[1px] dark:bg-ink-850/70 dark:text-slate-400">
          Updating…
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CohortDistStat label="Average" value={data.averageScorePercent} suffix="%" tone="brand" />
        <CohortDistStat label="Highest" value={data.highestScorePercent} suffix="%" tone="emerald" />
        <CohortDistStat label="Lowest" value={data.lowestScorePercent} suffix="%" tone="rose" />
      </div>
      <div className="space-y-3">
        {data.bands.map((row) => (
          <div key={row.band}>
            <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>{row.band}</span>
              <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {row.count}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CohortDistStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  tone: 'brand' | 'emerald' | 'rose' | 'slate';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'rose'
        ? 'text-rose-700 dark:text-rose-400'
        : tone === 'slate'
          ? 'text-slate-700 dark:text-slate-300'
          : 'text-brand-700 dark:text-brand-400';
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${toneClass}`}>
        {value == null ? '—' : `${value}${suffix ?? ''}`}
      </p>
    </div>
  );
}

export function TopicMasteryBars({ rows }: { rows: TopicAggregateRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No topic breakdown in grading data yet.
      </p>
    );
  }
  const maxPct = Math.max(...rows.map((r) => r.percentage), 1);
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
      {rows.map((row) => (
        <div key={row.topic}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate pr-2 font-medium text-slate-800 dark:text-slate-200">
              {row.topic}
            </span>
            <span className="flex-shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
              {row.percentage}% ({row.correct}/{row.total})
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.percentage / maxPct) * 100}%`,
                background:
                  row.percentage < 50
                    ? 'linear-gradient(90deg, #e11d48, #fb7185)'
                    : row.percentage < 70
                      ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                      : 'linear-gradient(90deg, #0d9488, #5eead4)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-select rounded-lg px-3 py-2"
      >
        {options.map((o) => (
          <option key={o.value || '__all'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
