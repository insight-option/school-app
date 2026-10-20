import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Bus, type SchoolClass } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

export function useClasses() {
  const session = useSession();
  return useQuery({
    queryKey: qk.classes(session.schoolId),
    enabled: session.status === 'signedIn',
    staleTime: 60_000,
    queryFn: async () => listAll((nextToken) => client.models.Class.listClassesBySchool({ schoolId: session.schoolId }, { limit: 100, nextToken })),
  });
}

export function useClassesByTeacher(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: qk.classesByTeacher(teacherId ?? ''),
    enabled: !!teacherId,
    queryFn: async () => listAll((nextToken) => client.models.Class.listClassesByTeacher({ teacherId: teacherId! }, { limit: 50, nextToken })),
  });
}

export function useBuses() {
  const session = useSession();
  return useQuery({
    queryKey: qk.buses(session.schoolId),
    enabled: session.status === 'signedIn',
    staleTime: 60_000,
    queryFn: async () => listAll((nextToken) => client.models.Bus.listBusesBySchool({ schoolId: session.schoolId }, { limit: 100, nextToken })),
  });
}

export function useBus(busId: string | null | undefined) {
  return useQuery({
    queryKey: qk.bus(busId ?? ''),
    enabled: !!busId,
    staleTime: 60_000,
    queryFn: async () => unwrap(await client.models.Bus.get({ busId: busId! }), 'bus'),
  });
}

export function useSaveClass() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; grade?: string | null }) => {
      if (input.id) return unwrap(await client.models.Class.update({ id: input.id, name: input.name, grade: input.grade ?? null }), 'class');
      return unwrap(await client.models.Class.create({ schoolId: session.schoolId, name: input.name, grade: input.grade ?? undefined, studentCount: 0 }), 'class');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Detach students, the teacher and courses, drop the class group chat, then the class itself.
      const students = await listAll((nextToken) => client.models.Profile.listProfilesByClass({ classId: id }, { limit: 200, nextToken }));
      await Promise.all(students.map((s) => client.models.Profile.update({ userId: s.userId, classId: null, className: null })));
      const cls = unwrap(await client.models.Class.get({ id }), 'class');
      if (cls?.teacherId) {
        const teacher = unwrap(await client.models.Profile.get({ userId: cls.teacherId }), 'teacher');
        if (teacher) await client.models.Profile.update({ userId: teacher.userId, classIds: (teacher.classIds ?? []).filter((c) => c !== id) });
      }
      const courses = await listAll((nextToken) => client.models.Course.listCoursesByClass({ classId: id }, { limit: 200, nextToken }));
      await Promise.all(courses.map((c) => client.models.Course.update({ id: c.id, classId: null, className: null })));
      const conversationId = `class_${id}`;
      const messages = await listAll((nextToken) => client.models.Message.listMessagesByConversation({ conversationId }, { limit: 200, nextToken }), 100);
      await Promise.all(messages.map((m) => client.models.Message.delete({ id: m.id })));
      const members = await listAll((nextToken) => client.models.ConversationMember.list({ conversationId, limit: 200, nextToken }));
      await Promise.all(members.map((m) => client.models.ConversationMember.delete({ conversationId: m.conversationId, userId: m.userId })));
      await client.models.Conversation.delete({ id: conversationId });
      return unwrap(await client.models.Class.delete({ id }), 'class');
    },
    onSuccess: () => {
      for (const key of ['classes', 'profiles', 'profile', 'inbox', 'conversation', 'conversations', 'courses']) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useUpdateBus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Bus> & { busId: string }) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = input as Bus;
      return unwrap(await client.models.Bus.update(rest), 'bus');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['buses'] }),
  });
}

// ───────── admin user-management mutations (Lambda-backed) ─────────
export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof client.mutations.createStudent>[0]) => unwrap(await client.mutations.createStudent(input), 'create student'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['buses'] });
    },
  });
}

export function useCreateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof client.mutations.createTeacher>[0]) => unwrap(await client.mutations.createTeacher(input), 'create teacher'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useCreateBus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof client.mutations.registerBus>[0]) => unwrap(await client.mutations.registerBus(input), 'create bus'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['buses'] });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async (input: { username: string; newPassword: string; sendEmail?: boolean; permanent?: boolean }) => unwrap(await client.mutations.resetUserPassword(input), 'reset password'),
  });
}

export function useSetUserEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; enabled: boolean }) => unwrap(await client.mutations.setUserEnabled(input), 'enable user'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['buses'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) => unwrap(await client.mutations.deleteUser({ username }), 'delete user'),
    onSuccess: () => {
      // A hard delete touches people, transport, chats and inboxes – refresh every cached list.
      for (const key of ['profiles', 'profile', 'classes', 'buses', 'bus', 'busLocation', 'trips', 'trip', 'stops', 'dayStatus', 'inbox', 'conversation', 'conversations', 'members', 'messages', 'feedback', 'notifications', 'devices']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useUpdateUserContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; email?: string; phone?: string }) => unwrap(await client.mutations.updateUserContact(input), 'update contact'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useAssignStudents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { studentIds: string[]; classId?: string; busId?: string }) => unwrap(await client.mutations.assignStudents(input), 'assign'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['buses'] });
    },
  });
}

export function useAssignTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teacherId: string; classIds: string[] }) => unwrap(await client.mutations.assignTeacher(input), 'assign teacher'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export type { SchoolClass, Bus };
