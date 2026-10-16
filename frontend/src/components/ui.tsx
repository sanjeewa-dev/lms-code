import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghostLight' | 'outlineBrand';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
    secondary:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/10',
    outlineBrand:
      'bg-white text-brand-700 border border-brand-300 hover:bg-brand-50 dark:bg-transparent dark:text-brand-300 dark:border-brand-700 dark:hover:bg-brand-900/30',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5',
    ghostLight: 'border border-white/20 text-slate-100 hover:bg-white/10',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-ink-850 ${className}`}
    >
      {children}
    </div>
  );
}

export function Input({
  label,
  error,
  className = '',
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;

  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <div className={isPassword ? 'relative' : undefined}>
        <input
          type={resolvedType}
          className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40 ${
            isPassword ? 'pr-10' : ''
          } ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
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
        className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40 ${className}`}
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
      <select className={`form-select ${className}`} {...props}>
        {children}
      </select>
    </label>
  );
}

/** Combobox-style select: type to filter options by label. */
export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Search…',
  allLabel = 'All',
  disabled = false,
  emptyLabel = 'No matches',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; hint?: string }>;
  placeholder?: string;
  /** Shown as the clear / “all” choice when provided. */
  allLabel?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) || (o.hint && o.hint.toLowerCase().includes(q))
      )
    : options;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  const display = open ? query : selected?.label ?? '';

  return (
    <div className="relative block" ref={rootRef}>
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      )}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={display}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              if (filtered[0]) pick(filtered[0].value);
            }
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-9 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-brand-900/40"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close' : 'Open'}
          onClick={() => !disabled && setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-ink-850"
        >
          {allLabel != null && (
            <li role="option" aria-selected={value === ''}>
              <button
                type="button"
                className={`flex w-full px-3.5 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5 ${
                  value === '' ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick('')}
              >
                {allLabel}
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2 text-sm text-slate-400">{emptyLabel}</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 ${
                    o.value === value ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                >
                  <span
                    className={`text-sm ${
                      o.value === value
                        ? 'font-semibold text-brand-700 dark:text-brand-300'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {o.label}
                  </span>
                  {o.hint && <span className="text-xs text-slate-400">{o.hint}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = 'slate',
  onGradient = false,
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
  /** Light translucent chip for use on brand-gradient heroes */
  onGradient?: boolean;
}) {
  if (onGradient) {
    return (
      <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/30">
        {children}
      </span>
    );
  }
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

export function Spinner({
  label,
  className = '',
  compact = false,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-white/20 dark:border-t-brand-400 ${className}`}
        role="status"
        aria-label={label || 'Loading'}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-slate-500 dark:text-slate-400 ${className}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 dark:border-white/20 dark:border-t-brand-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
    >
      {message}
    </div>
  );
}

/** Accessible modal with focus trap, Escape, and restore focus. */
export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Only run when `open` flips — not on every parent re-render / keystroke.
  // Inline `onClose={() => ...}` would otherwise re-trigger first?.focus() and steal focus.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-label') !== 'Close dialog')
        : [];

    // Prefer the first field inside the body, not the header Close button
    const bodyFirst = panel?.querySelector<HTMLElement>(
      '[data-modal-body] button, [data-modal-body] [href], [data-modal-body] input, [data-modal-body] select, [data-modal-body] textarea, [data-modal-body] [tabindex]:not([tabindex="-1"])'
    );
    (bodyFirst ?? focusables()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const list = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full rounded-2xl bg-white shadow-2xl dark:bg-ink-850 ${className.includes('max-w-') ? className : `max-w-lg ${className}`}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        <div data-modal-body className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'active' || status === 'approved' || status === 'delivered') return 'green';
  if (status === 'pending' || status === 'approval_pending' || status === 'processing') return 'amber';
  if (status === 'rejected' || status === 'cancelled') return 'red';
  return 'slate';
}
