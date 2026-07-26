import { z } from 'zod';

export const PASSWORD_REQUIREMENTS = [
  'At least 8 characters',
  'One lowercase letter (a–z)',
  'One uppercase letter (A–Z)',
  'One number (0–9)',
  'One symbol (e.g. !@#$%)',
] as const;

/** Returns the first failed rule message, or null if valid. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter (a–z)';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter (A–Z)';
  if (!/[0-9]/.test(password)) return 'Password must include a number (0–9)';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return 'Password must include a symbol (e.g. !@#$%)';
  }
  return null;
}

export const passwordSchema = z.string().max(100).superRefine((val, ctx) => {
  const err = validatePassword(val);
  if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
});
