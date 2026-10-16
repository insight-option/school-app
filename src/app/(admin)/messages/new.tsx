import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Chip, Input, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { flattenPages, useProfilesByRole } from '../../../features/profiles';
import { useOpenOfficeConversation } from '../../../features/messaging';
import type { Role } from '../../../lib/data/client';

/** "New message" picker: any teacher, driver or student/parent → opens their office conversation. */
export default function AdminNewMessage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [role, setRole] = useState<Role>('STUDENT');
  const [query, setQuery] = useState('');
  const q = useProfilesByRole(role);
  const open = useOpenOfficeConversation();
  const items = useMemo(() => {
    const s = query.trim().toLowerCase();
    return flattenPages(q.data?.pages).filter((p) => p.isActive !== false && (!s || p.fullName.toLowerCase().includes(s) || p.username.toLowerCase().includes(s)));
  }, [q.data, query]);
  return (
    <Screen back title={t('admin.newMessage')} padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['STUDENT', 'TEACHER', 'DRIVER'] as Role[]).map((r) => (
            <Chip key={r} label={t(`roles.${r}`)} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </ScrollView>
        <Input placeholder={t('admin.search')} value={query} onChangeText={setQuery} leftIcon="search" />
      </View>
      {q.isLoading && !q.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(p) => p.userId}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          renderItem={({ item }) => (
            <ListItem
              title={item.fullName}
              subtitle={[item.username, item.className, item.busName].filter(Boolean).join(' · ')}
              left={<Avatar name={item.fullName} avatarKey={item.avatarKey} />}
              right={<Badge label={t(`roles.${item.role}`)} size="sm" />}
              chevron
              onPress={() => open.mutate(item.userId, { onSuccess: (c) => c && router.replace(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })}
            />
          )}
        />
      )}
    </Screen>
  );
}
