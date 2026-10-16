import React, { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, EmptyState, Input, ListItem, Screen, Sheet, SkeletonList, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useClasses, useSaveClass } from '../../../features/school';

export default function AdminClasses() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const classes = useClasses();
  const save = useSaveClass();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');

  return (
    <Screen padded={false} title={t('admin.classes')} right={<Button size="sm" icon="add" title={t('admin.addClass')} onPress={() => setOpen(true)} />}>
      {classes.isLoading && !classes.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={classes.data ?? []}
          keyExtractor={(c) => c.id}
          refreshing={classes.isRefetching}
          onRefresh={() => classes.refetch()}
          ListEmptyComponent={<EmptyState icon="library-outline" title={t('common.emptyList')} actionLabel={t('admin.addClass')} onAction={() => setOpen(true)} />}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={`${item.grade ? `${t('admin.grade')} ${item.grade} · ` : ''}${item.teacherName ?? t('admin.noTeacher')}`}
              left={<Avatar name={item.name} icon="library" color={theme.colors.accent} />}
              right={<Badge label={t('common.students', { count: item.studentCount ?? 0 })} size="sm" />}
              chevron
              onPress={() => router.push(`/(admin)/classes/${item.id}` as never)}
            />
          )}
        />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('admin.addClass')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('admin.className')} value={name} onChangeText={setName} required placeholder="3A" />
          <Input label={t('admin.grade')} value={grade} onChangeText={setGrade} placeholder="3" />
          <Button
            title={t('common.create')}
            loading={save.isPending}
            disabled={name.trim().length < 1}
            onPress={() =>
              save.mutate(
                { name: name.trim(), grade: grade.trim() || null },
                {
                  onSuccess: (c) => {
                    setOpen(false);
                    setName('');
                    setGrade('');
                    if (c) router.push(`/(admin)/classes/${c.id}` as never);
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
