import React from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Screen, SkeletonCard, useTheme } from '../../../ui';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { useSession } from '../../../lib/auth/session';
import { useFeedbackByAuthor } from '../../../features/engagement';

export default function TeacherFeedback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const q = useFeedbackByAuthor(session.userId);
  return (
    <Screen padded={false} title={t('tabs.feedback')} subtitle={t('teacher.myFeedback')} right={<Button size="sm" icon="add" title={t('teacher.sendFeedback')} onPress={() => router.push('/(teacher)/send-feedback')} />}>
      {q.isLoading && !q.data ? (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlashList
          data={q.data ?? []}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: theme.spacing.lg }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="ribbon-outline" title={t('student.feedbackEmpty')} actionLabel={t('teacher.sendFeedback')} onAction={() => router.push('/(teacher)/send-feedback')} />}
          renderItem={({ item }) => (
            <View style={{ marginBottom: theme.spacing.md }}>
              <FeedbackCard item={item} showStudent />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
