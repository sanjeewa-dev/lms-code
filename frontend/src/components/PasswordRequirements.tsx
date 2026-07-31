import { passwordChecks } from '../lib/passwordValidation';

/** Live checklist for password strength rules (shared across all account setup flows). */
export function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
      <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        Password must include:
      </p>
      <ul className="space-y-1 text-xs">
        {checks.map((c) => (
          <li
            key={c.id}
            className={c.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}
          >
            {c.ok ? '✓' : '○'} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live match hint under confirm-password fields. */
export function passwordMismatchError(password: string, confirm: string): string | undefined {
  if (!confirm) return undefined;
  if (password !== confirm) return 'Passwords do not match';
  return undefined;
}
