import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, ConfirmSheet, EmptyState, Input, Screen, Sheet, SkeletonCard, Stars, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { useAdminDeleteFeedback, useAdminUpdateFeedback, useAllFeedback } from '../../../features/engagement';
import type { Feedback, FeedbackCategory } from '../../../lib/data/client';

const CATEGORIES: FeedbackCategory[] = ['ACADEMIC', 'BEHAVIOR', 'ATTENDANCE', 'PRAISE', 'OTHER'];

export default function AdminFeedback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const q = useAllFeedback(true);
  const update = useAdminUpdateFeedback();
  const del = useAdminDeleteFeedback();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [deleting, setDeleting] = useState<Feedback | null>(null);
  const [form, setForm] = useState({ title: '', body: '', rating: null as number | null });
  const items = useMemo(() => {
    const s = query.trim().toLowerCase();
    return (q.data?.pages.flatMap((p) => p.items) ?? []).filter((f) => (!category || f.category === category) && (!s || f.studentName.toLowerCase().includes(s) || f.title.toLowerCase().includes(s) || f.authorName.toLowerCase().includes(s)));
  }, [q.data, category, query]);

  return (
    <Screen padded={false} title={t('admin.feedback')} right={<Button size="sm" icon="add" title={t('admin.newFeedback')} onPress={() => router.push('/(admin)/feedback/new')} />}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
        <Input placeholder={t('common.search')} value={query} onChangeText={setQuery} leftIcon="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('common.all')} selected={!category} onPress={() => setCategory(null)} />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`teacher.categories.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>
      </View>
      {q.isLoading && !q.data ? (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: theme.spacing.lg }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="ribbon-outline" title={t('student.feedbackEmpty')} />}
          renderItem={({ item }) => (
            <View style={{ marginBottom: theme.spacing.md }}>
              <FeedbackCard
                item={item}
                showStudent
                actions={
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Button size="sm" variant="ghost" icon="create-outline" title="" onPress={() => { setEditing(item); setForm({ title: item.title, body: item.body, rating: item.rating ?? null }); }} />
                    <Button size="sm" variant="ghost" icon="trash-outline" title="" onPress={() => setDeleting(item)} />
                  </View>
                }
              />
            </View>
          )}
        />
      )}
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={t('feedback.edit')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('teacher.title')} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
          <Input label={t('teacher.body')} value={form.body} onChangeText={(v) => setForm((f) => ({ ...f, body: v }))} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
          <Text variant="captionStrong" color="textMuted">
            {t('teacher.rating')}
          </Text>
          <Stars value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
          <Button title={t('common.save')} loading={update.isPending} onPress={() => editing && update.mutate({ id: editing.id, title: form.title.trim(), body: form.body.trim(), rating: form.rating }, { onSuccess: () => setEditing(null), onError: (e) => toast.error(e.message) })} />
        </View>
      </Sheet>
      <ConfirmSheet visible={!!deleting} title={t('feedback.deleteConfirm')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive loading={del.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: (e) => toast.error(e.message) })} />
    </Screen>
  );
}
