import { useEffect, useState } from 'react';
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
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export const MAX_ATTACHMENT_MB = 50;
