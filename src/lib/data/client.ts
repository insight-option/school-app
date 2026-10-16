import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import '../amplify';

/** Typed Amplify Data client (Cognito user-pool auth by default). */
export const client = generateClient<Schema>({ authMode: 'userPool' });

export type { Schema };
export type Profile = Schema['Profile']['type'];
export type SchoolSettings = Schema['SchoolSettings']['type'];
export type Device = Schema['Device']['type'];
export type SchoolClass = Schema['Class']['type'];
export type Bus = Schema['Bus']['type'];
export type BusLocation = Schema['BusLocation']['type'];
export type StudentDayStatus = Schema['StudentDayStatus']['type'];
export type Trip = Schema['Trip']['type'];
export type TripStop = Schema['TripStop']['type'];
export type Conversation = Schema['Conversation']['type'];
export type ConversationMember = Schema['ConversationMember']['type'];
export type Message = Schema['Message']['type'];
export type Feedback = Schema['Feedback']['type'];
export type Broadcast = Schema['Broadcast']['type'];
export type Notification = Schema['Notification']['type'];
export type Course = Schema['Course']['type'];
export type CourseLesson = Schema['CourseLesson']['type'];
export type AuditLog = Schema['AuditLog']['type'];
export type ImportJob = Schema['ImportJob']['type'];
export type MessageReport = Schema['MessageReport']['type'];

export type Role = Schema['Role']['type'];
export type TripType = Schema['TripType']['type'];
export type TripStatus = Schema['TripStatus']['type'];
export type StopStatus = Schema['StopStatus']['type'];
export type DayStatus = Schema['DayStatus']['type'];
export type ConversationType = Schema['ConversationType']['type'];
export type MessageType = Schema['MessageType']['type'];
export type FeedbackAudience = Schema['FeedbackAudience']['type'];
export type FeedbackCategory = Schema['FeedbackCategory']['type'];
export type BroadcastAudience = Schema['BroadcastAudience']['type'];
export type NotificationType = Schema['NotificationType']['type'];
export type LatLng = { lat: number; lng: number };

/** Amplify returns GraphQL errors next to data; turn them into thrown Errors with a readable message. */
export function unwrap<T>(res: { data: T; errors?: { message: string }[] | null }, what = 'request'): T {
  if (res.errors?.length) {
    const msg = res.errors.map((e) => e.message).join('; ');
    throw new Error(humanizeError(msg, what));
  }
  return res.data;
}

export function unwrapRequired<T>(res: { data: T | null | undefined; errors?: { message: string }[] | null }, what = 'request'): T {
  const data = unwrap(res, what);
  if (data === null || data === undefined) throw new Error(`${what}: not found`);
  return data;
}

/** Lambda handlers throw `[CODE] message`; strip the AppSync wrapper so the UI shows the message. */
export function humanizeError(message: string, what = ''): string {
  const m = /\[(?:[A-Z_]+)\]\s*(.*)$/.exec(message);
  if (m) return m[1];
  if (/Not Authorized|Unauthorized/i.test(message)) return 'You are not allowed to do that.';
  if (/Network|Failed to fetch|timeout/i.test(message)) return 'Network problem. Check your connection and try again.';
  return what ? `${what}: ${message}` : message;
}

/**
 * AWSJSON fields arrive as strings from the API (sometimes double-encoded when a Lambda returns a
 * record it read itself) but as objects from optimistic updates – unwrap until we hit a non-string.
 */
export function parseJson<T = Record<string, unknown>>(value: unknown): T | undefined {
  let v: unknown = value;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (v === null || v === undefined) return undefined;
  return v as T;
}

/** Drain a paginated query up to `maxPages` (only for bounded sets). */
export async function listAll<T>(
  fetchPage: (nextToken: string | null | undefined) => Promise<{ data: T[]; nextToken?: string | null; errors?: { message: string }[] | null }>,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  let token: string | null | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(token);
    unwrap(page);
    out.push(...page.data);
    token = page.nextToken;
    if (!token) break;
  }
  return out;
}
