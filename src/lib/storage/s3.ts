import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getUrl, remove, uploadData } from 'aws-amplify/storage';
import { kv } from './mmkv';
import './../amplify';

/**
 * S3 helpers. All objects are private; the app only ever uses short-lived signed URLs that are
 * cached in memory (and MMKV) until shortly before they expire.
 */
const URL_TTL_SECONDS = 15 * 60;
const memo = new Map<string, { url: string; expiresAt: number }>();

export async function signedUrl(key: string): Promise<string> {
  const now = Date.now();
  const cached = memo.get(key) ?? kv.getJSON<{ url: string; expiresAt: number }>(`url:${key}`);
  if (cached && cached.expiresAt - 60_000 > now) {
    memo.set(key, cached);
    return cached.url;
  }
  const res = await getUrl({ path: key, options: { expiresIn: URL_TTL_SECONDS, validateObjectExistence: false } });
  const entry = { url: res.url.toString(), expiresAt: now + URL_TTL_SECONDS * 1000 };
  memo.set(key, entry);
  kv.setJSON(`url:${key}`, entry);
  return entry.url;
}

/** React hook: resolves a storage key to a signed URL (undefined while loading / when no key). */
export function useSignedUrl(key: string | null | undefined): string | undefined {
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    signedUrl(key)
      .then((u) => {
        if (alive) setResolved({ key, url: u });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return undefined;
  if (resolved?.key === key) return resolved.url;
  return memo.get(key)?.url;
}

export type UploadProgress = (fraction: number) => void;

/** Upload a local file URI (or Blob on web) to `path`. Returns the key. */
export async function uploadFile(path: string, source: string | Blob, contentType: string, onProgress?: UploadProgress): Promise<string> {
  const data = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const task = uploadData({
    path,
    data,
    options: {
      contentType,
      onProgress: ({ transferredBytes, totalBytes }) => {
        if (onProgress && totalBytes) onProgress(transferredBytes / totalBytes);
      },
    },
  });
  await task.result;
  return path;
}

export async function removeFile(path: string): Promise<void> {
  await remove({ path });
  memo.delete(path);
  kv.delete(`url:${path}`);
}

export function fileExtension(nameOrUri: string, fallback = 'bin'): string {
  const clean = nameOrUri.split('?')[0];
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(clean);
  return m ? m[1].toLowerCase() : fallback;
}

export function randomId(): string {
  // 128-bit random ids: storage keys are only protected by being unguessable (no listing allowed).
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cognito identity id of this device's user – the owner segment of avatars/ and school-media/ keys. */
export async function myIdentityId(): Promise<string> {
  const session = await fetchAuthSession();
  if (!session.identityId) throw new Error('Not signed in');
  return session.identityId;
}

export const MAX_ATTACHMENT_MB = 50;
