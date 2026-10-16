import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ConfirmSheet, Input, ListItem, ProgressBar, Screen, SectionHeader, Select, Sheet, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useCourses, useDeleteCourse, useDeleteLesson, useLessons, useSaveCourse, useSaveLesson } from '../../../features/ops';
import { useClasses } from '../../../features/school';
import { pickFromLibrary, uploadAttachment } from '../../../components/chat/attachments';
import type { CourseLesson } from '../../../lib/data/client';

export default function AdminCourseDetail() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const id = String(courseId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const courses = useCourses();
  const course = courses.data?.find((c) => c.id === id);
  const lessons = useLessons(id);
  const classes = useClasses();
  const saveCourse = useSaveCourse();
  const deleteCourse = useDeleteCourse();
  const saveLesson = useSaveLesson();
  const deleteLesson = useDeleteLesson();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', classId: null as string | null });
  const [lessonOpen, setLessonOpen] = useState<Partial<CourseLesson> | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openEdit = () => {
    if (course) setForm({ title: course.title, description: course.description ?? '', classId: course.classId ?? null });
    setEdit(true);
  };

  const uploadCover = async () => {
    const picked = await pickFromLibrary('images');
    if (!picked?.[0]) return;
    try {
      const { key } = await uploadAttachment(picked[0], `courses/${id}`);
      await saveCourse.mutateAsync({ id, title: course!.title, coverKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pickVideo = async () => {
    const picked = await pickFromLibrary('videos');
    if (!picked?.[0]) return;
    setProgress(0);
    try {
      const { key } = await uploadAttachment(picked[0], `courses/${id}`, setProgress);
      setVideoKey(key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const openLesson = (l?: CourseLesson) => {
    setLessonOpen(l ?? {});
    setLessonTitle(l?.title ?? '');
    setLessonDesc(l?.description ?? '');
    setVideoKey(l?.videoKey ?? null);
  };

  const submitLesson = () => {
    if (!lessonTitle.trim()) return toast.error(t('common.requiredField'));
    saveLesson.mutate(
      { id: lessonOpen?.id, courseId: id, title: lessonTitle.trim(), description: lessonDesc.trim() || null, videoKey, order: lessonOpen?.order ?? (lessons.data?.length ?? 0) + 1, published: lessonOpen?.published ?? true },
      { onSuccess: () => setLessonOpen(null), onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <Screen back title={course?.title ?? t('admin.courses')} scroll maxWidth={880}>
      {!course ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonCard />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Card style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge label={course.published ? t('admin.published') : t('admin.draft')} tone={course.published ? 'success' : 'neutral'} />
              <Badge label={course.className ?? t('common.all')} tone="primary" />
              <View style={{ flex: 1 }} />
              <Button size="sm" variant="outline" icon="create-outline" title={t('common.edit')} onPress={openEdit} />
            </View>
            {course.description ? <Text color="textMuted">{course.description}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant={course.published ? 'outline' : 'success'} icon={course.published ? 'eye-off-outline' : 'eye-outline'} title={course.published ? t('admin.unpublish') : t('admin.publish')} loading={saveCourse.isPending} onPress={() => saveCourse.mutate({ id, title: course.title, published: !course.published }, { onError: (e) => toast.error(e.message) })} />
              <Button size="sm" variant="outline" icon="image-outline" title={t('admin.uploadLogo').replace(t('admin.logo'), 'Cover')} onPress={uploadCover} />
              <Button size="sm" variant="danger" icon="trash-outline" title={t('common.delete')} onPress={() => setConfirmDelete(true)} />
            </View>
          </Card>
          <SectionHeader title={t('admin.lessons')} action={t('admin.addLesson')} onAction={() => openLesson()} />
          <Card padding={0}>
            {(lessons.data ?? []).map((l) => (
              <ListItem
                key={l.id}
                title={`${l.order}. ${l.title}`}
                subtitle={l.description ?? undefined}
                icon={l.videoKey ? 'videocam-outline' : 'document-text-outline'}
                right={<Badge label={l.published ? t('admin.published') : t('admin.draft')} tone={l.published ? 'success' : 'neutral'} size="sm" />}
                onPress={() => openLesson(l)}
                onLongPress={() => deleteLesson.mutate(l, { onError: (e) => toast.error(e.message) })}
                chevron
              />
            ))}
            {!lessons.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('common.emptyList')}
              </Text>
            ) : null}
          </Card>
        </View>
      )}
      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('common.edit')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('teacher.title')} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
          <Input label={t('teacher.body')} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
          <Select label={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={form.classId} onChange={(v) => setForm((f) => ({ ...f, classId: (v as string) || null }))} searchable />
          <Button title={t('admin.save')} loading={saveCourse.isPending} onPress={() => saveCourse.mutate({ id, title: form.title.trim(), description: form.description.trim() || null, classId: form.classId, className: classes.data?.find((c) => c.id === form.classId)?.name ?? null }, { onSuccess: () => setEdit(false), onError: (e) => toast.error(e.message) })} />
        </View>
      </Sheet>
      <Sheet visible={!!lessonOpen} onClose={() => setLessonOpen(null)} title={lessonOpen?.id ? t('common.edit') : t('admin.addLesson')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('teacher.title')} value={lessonTitle} onChangeText={setLessonTitle} required />
          <Input label={t('teacher.body')} value={lessonDesc} onChangeText={setLessonDesc} multiline />
          <Button title={videoKey ? `🎬 ${videoKey.split('/').pop()}` : t('common.video')} variant="outline" icon="cloud-upload-outline" onPress={pickVideo} disabled={progress !== null} />
          {progress !== null ? <ProgressBar value={progress} /> : null}
          {lessonOpen?.id ? (
            <Button title={lessonOpen.published ? t('admin.unpublish') : t('admin.publish')} variant="secondary" onPress={() => setLessonOpen((l) => (l ? { ...l, published: !l.published } : l))} />
          ) : null}
          <Button title={t('common.save')} loading={saveLesson.isPending} onPress={submitLesson} />
        </View>
      </Sheet>
      <ConfirmSheet visible={confirmDelete} title={t('common.confirmDeleteTitle')} body={t('common.confirmDeleteBody')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive loading={deleteCourse.isPending} onCancel={() => setConfirmDelete(false)} onConfirm={() => deleteCourse.mutate(id, { onSuccess: () => router.replace('/(admin)/courses'), onError: (e) => toast.error(e.message) })} />
    </Screen>
  );
}
