import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { KV_KEYS, storage } from '../storage/mmkv';

/**
 * TanStack Query client with a persisted (MMKV) cache: screens render instantly from the last
 * known data and refresh in the background (stale-while-revalidate). Offline mutations are paused
 * and resumed when connectivity returns (see src/lib/query/offline.ts).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 1000 * 60 * 60 * 24 * 7, // keep a week of cache for instant cold starts
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

export const queryPersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  key: KV_KEYS.queryCache,
  throttleTime: 1000,
});

/** Bump when the shape of cached data changes incompatibly. */
export const QUERY_CACHE_BUSTER = 'v1';

/** Query keys in one place so invalidation stays consistent. */
export const qk = {
  settings: (schoolId: string) => ['settings', schoolId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  profilesByRole: (role: string) => ['profiles', 'role', role] as const,
  profilesByClass: (classId: string) => ['profiles', 'class', classId] as const,
  profilesByBus: (busId: string) => ['profiles', 'bus', busId] as const,
  classes: (schoolId: string) => ['classes', schoolId] as const,
  classesByTeacher: (teacherId: string) => ['classes', 'teacher', teacherId] as const,
  buses: (schoolId: string) => ['buses', schoolId] as const,
  bus: (busId: string) => ['bus', busId] as const,
  busLocation: (busId: string) => ['busLocation', busId] as const,
  tripsByBusDate: (busId: string, date: string) => ['trips', busId, date] as const,
  tripsByDate: (date: string) => ['trips', 'date', date] as const,
  tripHistory: (busId: string) => ['trips', 'history', busId] as const,
  trip: (tripId: string) => ['trip', tripId] as const,
  stops: (tripId: string) => ['stops', tripId] as const,
  stopsByStudent: (studentId: string) => ['stops', 'student', studentId] as const,
  dayStatus: (studentId: string, date: string) => ['dayStatus', studentId, date] as const,
  dayStatusByBus: (busId: string, date: string) => ['dayStatus', 'bus', busId, date] as const,
  absencesByDate: (date: string) => ['dayStatus', 'date', date] as const,
  inbox: (userId: string) => ['inbox', userId] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  members: (conversationId: string) => ['members', conversationId] as const,
  feedbackByStudent: (studentId: string) => ['feedback', 'student', studentId] as const,
  feedbackBySchool: (schoolId: string) => ['feedback', 'school', schoolId] as const,
  feedbackByAuthor: (authorId: string) => ['feedback', 'author', authorId] as const,
  broadcasts: (scope: string) => ['broadcasts', scope] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  courses: (schoolId: string) => ['courses', schoolId] as const,
  coursesByClass: (classId: string) => ['courses', 'class', classId] as const,
  lessons: (courseId: string) => ['lessons', courseId] as const,
  audit: (schoolId: string) => ['audit', schoolId] as const,
  importJobs: (adminId: string) => ['importJobs', adminId] as const,
  importJob: (id: string) => ['importJob', id] as const,
  reports: (schoolId: string) => ['reports', schoolId] as const,
  devices: (userId: string) => ['devices', userId] as const,
  groupConversations: () => ['conversations', 'groups'] as const,
};
