import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Course, type CourseLesson, type ImportJob } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

// ───────────────────────────── courses ─────────────────────────────
export function useCourses(enabled = true) {
  const session = useSession();
  return useQuery({
    queryKey: qk.courses(session.schoolId),
    enabled: enabled && session.status === 'signedIn',
    staleTime: 60_000,
    queryFn: async () => listAll((nextToken) => client.models.Course.listCoursesBySchool({ schoolId: session.schoolId }, { limit: 100, nextToken })),
  });
}

export function useCoursesForClass(classId: string | null | undefined) {
  return useQuery({
    queryKey: qk.coursesByClass(classId ?? ''),
    enabled: !!classId,
    staleTime: 60_000,
    queryFn: async () => (await listAll((nextToken) => client.models.Course.listCoursesByClass({ classId: classId! }, { limit: 50, nextToken }))).filter((c) => c.published),
  });
}

export function useLessons(courseId: string | null | undefined) {
  return useQuery({
    queryKey: qk.lessons(courseId ?? ''),
    enabled: !!courseId,
    queryFn: async () => listAll((nextToken) => client.models.CourseLesson.listLessonsByCourse({ courseId: courseId! }, { limit: 100, nextToken })),
  });
}

export function useSaveCourse() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: Partial<Course> & { title: string }) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = input as Course;
      if (rest.id) return unwrap(await client.models.Course.update(rest), 'course');
      return unwrap(await client.models.Course.create({ ...rest, schoolId: session.schoolId, published: rest.published ?? false, lessonCount: 0 }), 'course');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['courses'] }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.Course.delete({ id }), 'course'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['courses'] }),
  });
}

export function useSaveLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CourseLesson> & { courseId: string; title: string; order: number }) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = input as CourseLesson;
      const saved = rest.id ? unwrap(await client.models.CourseLesson.update(rest), 'lesson') : unwrap(await client.models.CourseLesson.create({ ...rest, published: rest.published ?? false }), 'lesson');
      if (!rest.id) {
        const course = await client.models.Course.get({ id: input.courseId });
        if (course.data) await client.models.Course.update({ id: input.courseId, lessonCount: (course.data.lessonCount ?? 0) + 1 });
      }
      return saved;
    },
    onSuccess: (_, input) => {
      void qc.invalidateQueries({ queryKey: qk.lessons(input.courseId) });
      void qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lesson: CourseLesson) => {
      await client.models.CourseLesson.delete({ id: lesson.id });
      const course = await client.models.Course.get({ id: lesson.courseId });
      if (course.data) await client.models.Course.update({ id: lesson.courseId, lessonCount: Math.max(0, (course.data.lessonCount ?? 0) - 1) });
      return lesson;
    },
    onSuccess: (lesson) => {
      void qc.invalidateQueries({ queryKey: qk.lessons(lesson.courseId) });
      void qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

// ───────────────────────────── audit log ─────────────────────────────
export function useAuditLog(enabled: boolean, filter?: { action?: string; entityType?: string }) {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: [...qk.audit(session.schoolId), filter?.action ?? '', filter?.entityType ?? ''],
    enabled,
    initialPageParam: undefined as string | null | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await client.models.AuditLog.listAuditBySchool(
        { schoolId: session.schoolId },
        {
          limit: 50,
          sortDirection: 'DESC',
          nextToken: pageParam ?? undefined,
          filter: filter?.action || filter?.entityType ? { ...(filter.action ? { action: { eq: filter.action } } : {}), ...(filter.entityType ? { entityType: { eq: filter.entityType } } : {}) } : undefined,
        },
      );
      unwrap(res, 'audit');
      return { items: res.data, nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export function useMessageReports(enabled: boolean) {
  const session = useSession();
  return useQuery({
    queryKey: qk.reports(session.schoolId),
    enabled,
    staleTime: 30_000,
    queryFn: async () => listAll((nextToken) => client.models.MessageReport.listReportsBySchool({ schoolId: session.schoolId }, { limit: 50, nextToken, sortDirection: 'DESC' })),
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.MessageReport.update({ id, resolved: true }), 'report'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

// ───────────────────────────── bulk import jobs ─────────────────────────────
export type ImportRow = {
  username: string;
  password?: string;
  parentEmail: string;
  fullName: string;
  className?: string;
  classId?: string;
  busId?: string;
  parentPhone?: string;
  homeAddress?: string;
  grade?: string;
};

export function useStartImport() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { rows: ImportRow[]; fileKey?: string }) => {
      const job = unwrap(
        await client.models.ImportJob.create({
          adminId: session.userId ?? 'admin',
          schoolId: session.schoolId,
          fileKey: input.fileKey,
          status: 'PENDING',
          total: input.rows.length,
          processed: 0,
          created: 0,
          failed: 0,
          startedAt: new Date().toISOString(),
        }),
        'import job',
      );
      if (!job) throw new Error('job not created');
      await client.mutations.createStudentsBulk({ jobId: job.id, rowsJson: JSON.stringify(input.rows) });
      return job;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['importJobs'] }),
  });
}

export function useImportJob(jobId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.importJob(jobId ?? ''),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'COMPLETED' || s === 'FAILED' ? false : 3000;
    },
    queryFn: async () => unwrap(await client.models.ImportJob.get({ id: jobId! }), 'import job'),
  });
  useEffect(() => {
    if (!jobId) return;
    const sub = client.models.ImportJob.onUpdate({ filter: { id: { eq: jobId } } }).subscribe({
      next: (job) => qc.setQueryData<ImportJob | null>(qk.importJob(jobId), job),
      error: () => undefined,
    });
    return () => sub.unsubscribe();
  }, [jobId, qc]);
  return q;
}

export function useImportJobs(enabled: boolean) {
  const session = useSession();
  return useQuery({
    queryKey: qk.importJobs(session.userId ?? ''),
    enabled: enabled && !!session.userId,
    queryFn: async () => listAll((nextToken) => client.models.ImportJob.listImportJobsByAdmin({ adminId: session.userId! }, { limit: 20, nextToken, sortDirection: 'DESC' })),
  });
}
