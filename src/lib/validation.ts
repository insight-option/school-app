import { z } from 'zod';

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Cognito password policy mirror (min 8, upper, lower, digit). Returns an error message or null. */
export function passwordProblem(pwd: string, t: T): string | null {
  if (pwd.length < 8) return t('common.minChars', { count: 8 });
  if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd) || !/\d/.test(pwd)) return t('auth.passwordRules');
  return null;
}

export const emailSchema = z.email();
export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);
export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/);

export function isEmail(v: string) {
  return emailSchema.safeParse(v.trim()).success;
}
export function isUsername(v: string) {
  return usernameSchema.safeParse(v).success;
}
export function isPhone(v: string) {
  return !v || phoneSchema.safeParse(v).success;
}

/** Generates a password satisfying the pool policy. */
export function generatePassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const all = lower + upper + digits;
  let p = pick(upper) + pick(lower) + pick(digits) + pick(digits);
  for (let i = 0; i < 6; i++) p += pick(all);
  return p
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/** Validate a zod schema and return the first message per field (for inline form errors). */
export function fieldErrors<T extends z.ZodRawShape>(schema: z.ZodObject<T>, values: unknown): { ok: true; data: z.infer<z.ZodObject<T>> } | { ok: false; errors: Record<string, string> } {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
