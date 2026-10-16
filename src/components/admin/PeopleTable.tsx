import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, EmptyState, ListItem, SkeletonList, Text, useTheme } from '../../ui';
import type { Profile } from '../../lib/data/client';

/**
 * Student / teacher list: dense table on wide screens, list rows on phones. Virtualised with FlashList.
 */
export function PeopleTable({
  items,
  loading,
  onPress,
  onEndReached,
  refreshing,
  onRefresh,
  columns,
  emptyTitle,
  header,
}: {
  items: Profile[];
  loading: boolean;
  onPress: (p: Profile) => void;
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  columns: ('class' | 'bus' | 'parent' | 'email' | 'phone' | 'classes')[];
  emptyTitle: string;
  header?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  if (loading && !items.length) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <SkeletonList />
      </View>
    );
  }

  const cell = (p: Profile, c: (typeof columns)[number]) => {
    switch (c) {
      case 'class':
        return p.className ?? t('admin.noClass');
      case 'bus':
        return p.busName ?? t('admin.noBus');
      case 'parent':
        return [p.parentEmail, p.parentPhone].filter(Boolean).join(' · ');
      case 'email':
        return p.email ?? '';
      case 'phone':
        return p.phone ?? '';
      case 'classes':
        return p.className ?? '';
    }
  };
  const colLabel = (c: (typeof columns)[number]) => ({ class: t('admin.class'), bus: t('admin.bus'), parent: t('teacher.parent'), email: t('common.email'), phone: t('common.phone'), classes: t('tabs.classes') })[c];

  return (
    <FlashList
      data={items}
      keyExtractor={(p) => p.userId}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <>
          {header}
          {wide ? (
            <View style={{ flexDirection: 'row', paddingHorizontal: theme.spacing.lg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 }}>
              <Text variant="label" color="textMuted" style={{ flex: 2 }}>
                {t('common.name')}
              </Text>
              <Text variant="label" color="textMuted" style={{ flex: 1 }}>
                {t('common.id')}
              </Text>
              {columns.map((c) => (
                <Text key={c} variant="label" color="textMuted" style={{ flex: 1.5 }}>
                  {colLabel(c)}
                </Text>
              ))}
              <Text variant="label" color="textMuted" style={{ width: 90 }}>
                {t('common.status')}
              </Text>
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={<EmptyState icon="people-outline" title={emptyTitle} compact />}
      renderItem={({ item }) =>
        wide ? (
          <ListItem
            title={item.fullName}
            left={<Avatar name={item.fullName} avatarKey={item.avatarKey} size={36} />}
            onPress={() => onPress(item)}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                  {item.username}
                </Text>
                {columns.map((c) => (
                  <Text key={c} variant="caption" color="textMuted" style={{ flex: 1.5 }} numberOfLines={1}>
                    {cell(item, c)}
                  </Text>
                ))}
                <View style={{ width: 90 }}>
                  <Badge label={item.isActive === false ? t('common.disabled') : t('common.active')} tone={item.isActive === false ? 'danger' : 'success'} size="sm" />
                </View>
              </View>
            }
            style={{ minHeight: 52 }}
            titleLines={1}
          />
        ) : (
          <ListItem
            title={item.fullName}
            subtitle={`${item.username} · ${columns.map((c) => cell(item, c)).filter(Boolean).join(' · ')}`}
            left={<Avatar name={item.fullName} avatarKey={item.avatarKey} />}
            right={item.isActive === false ? <Badge label={t('common.disabled')} tone="danger" size="sm" /> : undefined}
            chevron
            onPress={() => onPress(item)}
          />
        )
      }
    />
  );
}
