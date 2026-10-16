import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';

export type DataClient = ReturnType<typeof generateClient<Schema>>;
export type DataEnv = Parameters<typeof getAmplifyDataClientConfig>[0];

let cached: Promise<DataClient> | undefined;

/** Lazily configure Amplify (IAM auth) once per Lambda container and return the typed Data client. */
export function getDataClient(env: DataEnv): Promise<DataClient> {
  if (!cached) {
    cached = (async () => {
      const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
      Amplify.configure(resourceConfig, libraryOptions);
      return generateClient<Schema>();
    })();
  }
  return cached;
}

type Page<T> = { data: T[]; nextToken?: string | null; errors?: { message: string }[] };

/** Drain a paginated index query (used only for bounded sets: a class, a bus, admins, devices…). */
export async function listAll<T>(
  fetchPage: (nextToken: string | null | undefined) => Promise<Page<T>>,
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = [];
  let token: string | null | undefined = undefined;
  for (let i = 0; i < maxPages; i++) {
    const page: Page<T> = await fetchPage(token);
    if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
    out.push(...page.data);
    token = page.nextToken;
    if (!token) break;
  }
  return out;
}

/** Iterate a huge index (e.g. all students) page by page without holding everything in memory. */
export async function forEachPage<T>(
  fetchPage: (nextToken: string | null | undefined) => Promise<Page<T>>,
  onPage: (items: T[]) => Promise<void>,
  maxPages = 10_000,
): Promise<number> {
  let token: string | null | undefined = undefined;
  let count = 0;
  for (let i = 0; i < maxPages; i++) {
    const page: Page<T> = await fetchPage(token);
    if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join('; '));
    if (page.data.length) {
      count += page.data.length;
      await onPage(page.data);
    }
    token = page.nextToken;
    if (!token) break;
  }
  return count;
}

export function unwrap<T>(res: { data: T | null; errors?: { message: string }[] }, what: string): T {
  if (res.errors?.length) throw new Error(`${what}: ${res.errors.map((e) => e.message).join('; ')}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: not found`);
  return res.data;
}

/** Run async jobs with bounded concurrency (Cognito / AppSync friendly). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const nowIso = () => new Date().toISOString();

/** YYYY-MM-DD for "today" in the school timezone. */
export function todayInTimezone(timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function getSettings(client: DataClient, schoolId: string) {
  const res = await client.models.SchoolSettings.get({ schoolId });
  return res.data;
}

export async function audit(
  client: DataClient,
  entry: {
    schoolId: string;
    actorId: string;
    actorName?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  try {
    await client.models.AuditLog.create({
      schoolId: entry.schoolId,
      actorId: entry.actorId,
      actorName: entry.actorName ?? undefined,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : JSON.stringify(entry.before),
      after: entry.after === undefined ? undefined : JSON.stringify(entry.after),
      occurredAt: nowIso(),
    });
  } catch (e) {
    console.error('audit failed', e);
  }
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const name = (e as { name?: string })?.name ?? '';
      const retryable = /TooManyRequests|Throttling|LimitExceeded|ServiceUnavailable|InternalError|Network|ECONN/i.test(name + String(e));
      if (!retryable || i === attempts - 1) throw e;
      await sleep(baseMs * 2 ** i + Math.random() * 100);
    }
  }
  throw lastErr;
}
