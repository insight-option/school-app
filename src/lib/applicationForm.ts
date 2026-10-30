import type { ApplicationForm } from '../features/directory';

/** Client-side validation mirroring the server (comms Lambda) so families get instant feedback. */
export type ApplicationErrors = Partial<Record<keyof ApplicationForm, 'required' | 'email' | 'phone' | 'dob'>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{6,32}$/;
const DOB = /^\d{4}-\d{2}-\d{2}$/;

export function validateApplication(f: ApplicationForm, today = new Date().toISOString().slice(0, 10)): ApplicationErrors {
  const e: ApplicationErrors = {};
  if ((f.studentName ?? '').trim().length < 2) e.studentName = 'required';
  if ((f.parentName ?? '').trim().length < 2) e.parentName = 'required';
  if (!EMAIL.test((f.parentEmail ?? '').trim())) e.parentEmail = (f.parentEmail ?? '').trim() ? 'email' : 'required';
  const phone = (f.parentPhone ?? '').trim();
  if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 6) e.parentPhone = phone ? 'phone' : 'required';
  const dob = (f.dateOfBirth ?? '').trim();
  if (dob && (!DOB.test(dob) || Number.isNaN(Date.parse(dob)) || dob > today || dob < '1990-01-01')) e.dateOfBirth = 'dob';
  return e;
}

/** Trim strings and drop empty optionals before sending. */
export function cleanApplication(f: ApplicationForm): ApplicationForm {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) out[k] = s;
    } else if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ApplicationForm;
}

/** Inserts dashes while typing a date: 20190507 → 2019-05-07. */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}
