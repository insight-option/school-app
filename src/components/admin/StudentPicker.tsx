import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Input, ListItem, Sheet, Text, useTheme } from '../../ui';
import { flattenPages, useProfilesByRole } from '../../features/profiles';
import type { Profile } from '../../lib/data/client';

/**
 * Searchable multi-select of students for class / bus assignment. Shows seat usage when a capacity
 * is given and warns when it is exceeded.
 */
export function StudentPicker({
  visible,
  onClose,
  title,
  initialSelected,
  onConfirm,
  capacity,
  loading,
  filter,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  initialSelected: string[];
  onConfirm: (ids: string[]) => void;
  capacity?: number | null;
  loading?: boolean;
  filter?: (p: Profile) => boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const students = useProfilesByRole('STUDENT', visible);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  // Reset the selection each time the sheet opens ("adjust state when a prop changes" pattern).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSelected(new Set(initialSelected));
  }

  const all = useMemo(() => flattenPages(students.data?.pages).filter((p) => p.role === 'STUDENT' && p.isActive !== false && (!filter || filter(p))), [students.data, filter]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? all.filter((p) => p.fullName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.className ?? '').toLowerCase().includes(q)) : all;
    return rows.slice().sort((a, b) => Number(selected.has(b.userId)) - Number(selected.has(a.userId)) || a.fullName.localeCompare(b.fullName));
  }, [all, query, selected]);
  const over = capacity != null && selected.size > capacity;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      scroll={false}
      maxHeightFraction={0.92}
      footer={
        <View style={{ gap: 8 }}>
          {capacity != null ? (
            <Text variant="captionStrong" color={over ? 'danger' : 'textMuted'}>
              {t('admin.capacityUsage', { used: selected.size, capacity })}
              {over ? ` · ${t('admin.capacityExceeded', { count: selected.size - capacity })}` : ''}
            </Text>
          ) : (
            <Text variant="captionStrong" color="textMuted">
              {t('admin.selected', { count: selected.size })}
            </Text>
          )}
          <Button title={t('admin.save')} onPress={() => onConfirm(Array.from(selected))} loading={loading} />
        </View>
      }
    >
      <Input placeholder={t('admin.search')} value={query} onChangeText={setQuery} leftIcon="search" containerStyle={{ marginBottom: 8 }} />
      <View style={{ height: 420 }}>
        <FlashList
          data={list}
          keyExtractor={(p) => p.userId}
          onEndReached={() => students.hasNextPage && !students.isFetchingNextPage && students.fetchNextPage()}
          renderItem={({ item }) => {
            const on = selected.has(item.userId);
            return (
              <ListItem
                title={item.fullName}
                subtitle={[item.username, item.className, item.busName ? `${t('admin.bus')} ${item.busName}` : null].filter(Boolean).join(' · ')}
                left={<Avatar name={item.fullName} avatarKey={item.avatarKey} size={36} />}
                right={<Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? theme.colors.primary : theme.colors.textFaint} />}
                selected={on}
                onPress={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(item.userId)) n.delete(item.userId);
                    else n.add(item.userId);
                    return n;
                  })
                }
              />
            );
          }}
        />
      </View>
    </Sheet>
  );
}
