export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number (0–9)', test: (p: string) => /[0-9]/.test(p) },
  {
    id: 'symbol',
    label: 'One symbol (e.g. !@#$%)',
    test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p),
  },
] as const;

export function validatePassword(password: string): string | null {
  for (const rule of PASSWORD_REQUIREMENTS) {
    if (!rule.test(password)) return rule.label;
  }
  return null;
}

export function passwordChecks(password: string) {
  return PASSWORD_REQUIREMENTS.map((r) => ({ ...r, ok: r.test(password) }));
}
