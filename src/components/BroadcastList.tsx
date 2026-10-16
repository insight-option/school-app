import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge, Card, EmptyState, SkeletonCard, Text, useTheme } from '../ui';
import type { Broadcast } from '../lib/data/client';
import { formatDateTime } from '../lib/util/format';
import { AttachmentChips } from './AttachmentChips';

export function BroadcastList({ items, loading, showAudience }: { items: Broadcast[] | undefined; loading: boolean; showAudience?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (loading && !items) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (!items?.length) return <EmptyState icon="megaphone-outline" title={t('broadcast.empty')} body={t('broadcast.emptyBody')} compact />;
  return (
    <View style={{ gap: theme.spacing.md }}>
      {items.map((b) => (
        <Card key={b.id} style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {showAudience ? <Badge label={b.targetName ? `${t(`admin.audiences.${b.audience}`)} · ${b.targetName}` : t(`admin.audiences.${b.audience}`)} tone="accent" /> : null}
            <View style={{ flex: 1 }} />
            <Text variant="caption" color="textFaint">
              {formatDateTime(b.postedAt)}
            </Text>
          </View>
          <Text variant="subheading">{b.title}</Text>
          <Text>{b.body}</Text>
          <AttachmentChips keys={(b.attachmentKeys ?? []).filter((k): k is string => !!k)} />
          {b.authorName ? (
            <Text variant="caption" color="textMuted">
              {t('feedback.from', { name: b.authorName })}
              {showAudience && b.recipientCount ? ` · ${b.recipientCount} ✓` : ''}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
