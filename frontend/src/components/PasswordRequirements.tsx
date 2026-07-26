import { passwordChecks } from '../lib/passwordValidation';

export function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <ul className="space-y-1 text-xs">
      {checks.map((c) => (
        <li
          key={c.id}
          className={c.ok ? 'text-emerald-600' : 'text-slate-400'}
        >
          {c.ok ? '✓' : '○'} {c.label}
        </li>
      ))}
    </ul>
  );
}
