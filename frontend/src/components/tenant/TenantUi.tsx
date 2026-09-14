import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

type Tone = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'sky' | 'violet';

const toneChip: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  green: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  purple: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  violet: 'bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  pink: 'bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300',
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
};

export function PageHeader({
  icon,
  tone = 'blue',
  title,
  subtitle,
  action,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${toneChip[tone]}`}>
          <Icon name={icon} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function FormPanel({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/5 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/5 dark:bg-white/5">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-200/60 dark:hover:bg-white/10"
          >
            Close
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center dark:border-white/10 dark:bg-ink-850">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
