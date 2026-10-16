import React, { useMemo } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { useSession } from '../../../lib/auth/session';
import { useFeedbackForStudent } from '../../../features/engagement';
import { relativeDay } from '../../../lib/util/format';
import type { Feedback } from '../../../lib/data/client';

type Row = { kind: 'day'; id: string; label: string } | { kind: 'item'; id: string; item: Feedback };

export default function StudentFeedback() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const q = useFeedbackForStudent(session.userId, true);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let day = '';
    for (const f of q.data ?? []) {
      const d = f.postedAt.slice(0, 10);
      if (d !== day) {
        out.push({ kind: 'day', id: `d-${d}`, label: relativeDay(d, t) });
        day = d;
      }
      out.push({ kind: 'item', id: f.id, item: f });
    }
    return out;
  }, [q.data, t]);

  return (
    <Screen padded={false} title={t('tabs.feedback')}>
      {q.isLoading && !q.data ? (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.id}
          getItemType={(r) => r.kind}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="ribbon-outline" title={t('student.feedbackEmpty')} body={t('student.feedbackEmptyBody')} />}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <Text variant="label" color="textMuted" style={{ textTransform: 'uppercase', paddingVertical: theme.spacing.sm, paddingTop: theme.spacing.lg }}>
                {item.label}
              </Text>
            ) : (
              <View style={{ marginBottom: theme.spacing.md }}>
                <FeedbackCard item={item.item} />
              </View>
            )
          }
        />
      )}
    </Screen>
  );
}
