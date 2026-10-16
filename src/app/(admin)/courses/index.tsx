import React, { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, EmptyState, Input, ListItem, Screen, Select, Sheet, SkeletonList, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useCourses, useSaveCourse } from '../../../features/ops';
import { useClasses } from '../../../features/school';

export default function AdminCourses() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const courses = useCourses();
  const classes = useClasses();
  const save = useSaveCourse();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState<string | null>(null);

  return (
    <Screen padded={false} title={t('admin.courses')} right={<Button size="sm" icon="add" title={t('admin.addCourse')} onPress={() => setOpen(true)} />}>
      {courses.isLoading && !courses.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={courses.data ?? []}
          keyExtractor={(c) => c.id}
          refreshing={courses.isRefetching}
          onRefresh={() => courses.refetch()}
          ListEmptyComponent={<EmptyState icon="book-outline" title={t('student.coursesEmptyTitle')} actionLabel={t('admin.addCourse')} onAction={() => setOpen(true)} />}
          renderItem={({ item }) => (
            <ListItem
              title={item.title}
              subtitle={[item.className ?? t('common.all'), `${item.lessonCount ?? 0} ${t('admin.lessons')}`].join(' · ')}
              left={<Avatar name={item.title} icon="book" color={theme.colors.primary} />}
              right={<Badge label={item.published ? t('admin.published') : t('admin.draft')} tone={item.published ? 'success' : 'neutral'} size="sm" />}
              chevron
              onPress={() => router.push(`/(admin)/courses/${item.id}` as never)}
            />
          )}
        />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('admin.addCourse')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('teacher.title')} value={title} onChangeText={setTitle} required />
          <Input label={t('teacher.body')} value={description} onChangeText={setDescription} multiline />
          <Select label={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={classId} onChange={(v) => setClassId((v as string) || null)} searchable />
          <Button
            title={t('common.create')}
            loading={save.isPending}
            disabled={!title.trim()}
            onPress={() =>
              save.mutate(
                { title: title.trim(), description: description.trim() || null, classId, className: classes.data?.find((c) => c.id === classId)?.name ?? null, published: false },
                {
                  onSuccess: (c) => {
                    setOpen(false);
                    setTitle('');
                    setDescription('');
                    if (c) router.push(`/(admin)/courses/${c.id}` as never);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          />
        </View>
      </Sheet>
    </Screen>
  );
}
