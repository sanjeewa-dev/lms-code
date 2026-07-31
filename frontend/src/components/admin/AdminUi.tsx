import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../icons';

type Tone = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'sky';

const toneChip: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-emerald-100 text-emerald-600',
  purple: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  pink: 'bg-pink-100 text-pink-600',
  sky: 'bg-sky-100 text-sky-600',
};

/** Same StatCard pattern as the tenant Dashboard — keeps platform UI consistent. */
export function AdminStatCard({
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

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
