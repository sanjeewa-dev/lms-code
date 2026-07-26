import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghostLight';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
    secondary:
      'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/10',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
    ghostLight: 'border border-white/20 text-slate-100 hover:bg-white/10',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-ink-850 ${className}`}
    >
      {children}
    </div>
  );
}

export function Input({
  label,
  error,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <input
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40 ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Textarea({
  label,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <textarea
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({
  label,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <select
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    green: 'bg-green-100 text-green-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    blue: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500 dark:text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-white/20 dark:border-t-brand-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'active' || status === 'approved') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'rejected') return 'red';
  return 'slate';
}
