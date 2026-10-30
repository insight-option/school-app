import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Broadcast, type BroadcastAudience, type Feedback, type FeedbackAudience, type FeedbackCategory, type Notification } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

// ───────────────────────────── feedback ─────────────────────────────
export function useFeedbackForStudent(studentId: string | null | undefined, parentOnly = false) {
  const session = useSession();
  const asTeacher = session.role === 'TEACHER';
  return useQuery({
    queryKey: [...qk.feedbackByStudent(studentId ?? ''), parentOnly, asTeacher],
    enabled: !!studentId,
    staleTime: 30_000,
    queryFn: async (): Promise<Feedback[]> => {
      if (asTeacher) {
        // Teachers see the whole history of students in their classes (checked server-side).
        const items = unwrap(await client.queries.listStudentFeedback({ studentId: studentId! }), 'feedback') ?? [];
        return items.filter((f): f is NonNullable<typeof f> => !!f) as unknown as Feedback[];
      }
      const rows = await listAll((nextToken) => client.models.Feedback.listFeedbackByStudent({ studentId: studentId! }, { limit: 50, nextToken, sortDirection: 'DESC' }));
      return parentOnly ? rows.filter((f) => f.audience !== 'OFFICE') : rows;
    },
  });
}

export function useFeedbackByAuthor(authorId: string | null | undefined) {
  return useQuery({
    queryKey: qk.feedbackByAuthor(authorId ?? ''),
    enabled: !!authorId,
    staleTime: 30_000,
    queryFn: async () => listAll((nextToken) => client.models.Feedback.listFeedbackByAuthor({ authorId: authorId! }, { limit: 50, nextToken, sortDirection: 'DESC' })),
  });
}

export function useAllFeedback(enabled: boolean) {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: qk.feedbackBySchool(session.schoolId),
    enabled,
    initialPageParam: undefined as string | null | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await client.models.Feedback.listFeedbackBySchool({ schoolId: session.schoolId }, { limit: 50, sortDirection: 'DESC', nextToken: pageParam ?? undefined });
      unwrap(res, 'feedback');
      return { items: res.data, nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { studentIds: string[]; audience: FeedbackAudience; category: FeedbackCategory; rating?: number | null; title: string; body: string; attachmentKeys?: string[] }) =>
      unwrap(await client.mutations.submitFeedback({ ...input, rating: input.rating ?? undefined }), 'feedback'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}

export function useAdminUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Feedback> & { id: string }) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = patch as Feedback;
      return unwrap(await client.models.Feedback.update(rest), 'feedback');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}

export function useAdminDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.Feedback.delete({ id }), 'feedback'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}

// ───────────────────────────── broadcasts ─────────────────────────────
export function useBroadcastsForMe(profile: { role: string; classId?: string | null; busId?: string | null } | null | undefined) {
  const session = useSession();
  const role = profile?.role ?? session.role ?? '';
  const audience: BroadcastAudience | null = role === 'STUDENT' ? 'ALL_STUDENTS' : role === 'TEACHER' ? 'ALL_TEACHERS' : role === 'DRIVER' ? 'ALL_DRIVERS' : null;
  const scope = `${session.schoolId}-${audience}-${profile?.classId ?? ''}-${profile?.busId ?? ''}`;
  return useQuery({
    queryKey: qk.broadcasts(scope),
    enabled: !!audience && !!session.schoolId,
    staleTime: 60_000,
    queryFn: async (): Promise<Broadcast[]> => {
      // School-scoped, newest first; keep what is addressed to everyone in my role, my class or my bus.
      const rows = await listAll((nextToken) => client.models.Broadcast.listBroadcastsBySchool({ schoolId: session.schoolId }, { limit: 100, nextToken, sortDirection: 'DESC' }), 5);
      return rows.filter(
        (b) =>
          b.audience === audience ||
          (b.audience === 'CLASS' && !!profile?.classId && b.targetId === profile.classId) ||
          (b.audience === 'BUS' && !!profile?.busId && b.targetId === profile.busId),
      );
    },
  });
}

export function useAllBroadcasts(enabled: boolean) {
  const session = useSession();
  return useQuery({
    queryKey: qk.broadcasts('school'),
    enabled,
    staleTime: 30_000,
    queryFn: async () => listAll((nextToken) => client.models.Broadcast.listBroadcastsBySchool({ schoolId: session.schoolId }, { limit: 50, nextToken, sortDirection: 'DESC' })),
  });
}

export function useSendBroadcast() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { audience: BroadcastAudience; targetId?: string | null; targetName?: string | null; title: string; body: string; attachmentKeys?: string[]; authorName?: string }) => {
      const created = unwrap(
        await client.models.Broadcast.create({
          schoolId: session.schoolId,
          authorId: session.userId ?? 'admin',
          authorName: input.authorName,
          audience: input.audience,
          targetId: input.targetId || 'ALL',
          targetName: input.targetName ?? undefined,
          title: input.title,
          body: input.body,
          attachmentKeys: input.attachmentKeys ?? [],
          postedAt: new Date().toISOString(),
          recipientCount: 0,
          deliveryStatus: 'PENDING',
        }),
        'broadcast',
      );
      if (!created) throw new Error('broadcast not created');
      await client.mutations.sendBroadcast({ broadcastId: created.id });
      return created;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

// ───────────────────────────── notifications ─────────────────────────────
export function useNotifications(userId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: qk.notifications(userId ?? ''),
    enabled: !!userId,
    staleTime: 15_000,
    initialPageParam: undefined as string | null | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await client.models.Notification.listNotificationsByUser({ userId: userId! }, { limit: 50, sortDirection: 'DESC', nextToken: pageParam ?? undefined });
      unwrap(res, 'notifications');
      return { items: res.data, nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export function useNotificationSubscription(userId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId || !enabled) return;
    // No filter: userId is the owner field, so AppSync already delivers only the caller's rows and
    // rejects a second filter on it.
    const sub = client.models.Notification.onCreate().subscribe({
      next: (n) =>
        n.userId === userId &&
        qc.setQueryData<{ pages: { items: Notification[]; nextToken: string | null }[]; pageParams: unknown[] }>(qk.notifications(userId), (old) => {
          if (!old) return { pages: [{ items: [n], nextToken: null }], pageParams: [undefined] };
          const [first, ...rest] = old.pages;
          if (first.items.some((x) => x.id === n.id)) return old;
          return { ...old, pages: [{ ...first, items: [n, ...first.items] }, ...rest] };
        }),
      error: (e) => console.warn('notification sub', e),
    });
    return () => sub.unsubscribe();
  }, [userId, enabled, qc]);
}

export function useUnreadNotifications(userId: string | null | undefined) {
  const q = useNotifications(userId);
  return q.data?.pages.flatMap((p) => p.items).filter((n) => !n.read).length ?? 0;
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Notification[]) => {
      await Promise.all(items.filter((n) => !n.read).map((n) => client.models.Notification.update({ id: n.id, read: true })));
      return items.map((n) => n.userId)[0];
    },
    onSuccess: (userId) => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.notifications(userId) });
    },
  });
}

export function useRequestDataDeletion() {
  return useMutation({ mutationFn: async (reason?: string) => unwrap(await client.mutations.requestDataDeletion({ reason }), 'request') });
}
