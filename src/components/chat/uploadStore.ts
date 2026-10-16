import { create } from 'zustand';
import type { MessageType } from '../../lib/data/client';

export type PendingUpload = {
  clientId: string;
  conversationId: string;
  type: MessageType;
  localUri: string;
  progress: number; // 0..1
  status: 'uploading' | 'failed';
  meta: AttachmentMeta;
  error?: string;
  retry?: () => void;
};

export type AttachmentMeta = {
  name?: string;
  size?: number;
  mime?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  thumbKey?: string;
};

type State = {
  uploads: Record<string, PendingUpload>;
  start: (u: PendingUpload) => void;
  progress: (clientId: string, p: number) => void;
  fail: (clientId: string, error: string, retry?: () => void) => void;
  finish: (clientId: string) => void;
  /** local URIs by clientId so optimistic bubbles can render media before signed URLs resolve */
  localUris: Record<string, string>;
};

export const useUploadStore = create<State>((set) => ({
  uploads: {},
  localUris: {},
  start: (u) => set((s) => ({ uploads: { ...s.uploads, [u.clientId]: u }, localUris: { ...s.localUris, [u.clientId]: u.localUri } })),
  progress: (clientId, p) => set((s) => (s.uploads[clientId] ? { uploads: { ...s.uploads, [clientId]: { ...s.uploads[clientId], progress: p } } } : s)),
  fail: (clientId, error, retry) => set((s) => (s.uploads[clientId] ? { uploads: { ...s.uploads, [clientId]: { ...s.uploads[clientId], status: 'failed', error, retry } } } : s)),
  finish: (clientId) =>
    set((s) => {
      const { [clientId]: _removed, ...rest } = s.uploads;
      return { uploads: rest };
    }),
}));
