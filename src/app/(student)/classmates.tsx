import React from 'react';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, EmptyState, ListItem, Screen, SkeletonList } from '../../ui';
import { toast } from '../../ui/Toast';
import { useSession } from '../../lib/auth/session';
import { useMyProfile, useProfilesByClass } from '../../features/profiles';
import { useSettings } from '../../features/settings';
import { useOpenDirectConversation } from '../../features/messaging';

export default function ClassmatesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const classmates = useProfilesByClass(me.data?.classId);
  const openDm = useOpenDirectConversation();
  const list = (classmates.data ?? []).filter((p) => p.userId !== session.userId && p.role === 'STUDENT' && p.isActive !== false);

  if (settings.data && settings.data.studentChatEnabled === false) {
    return (
      <Screen back title={t('student.classmates')}>
        <EmptyState icon="chatbubble-ellipses-outline" title={t('student.chatDisabled')} />
      </Screen>
    );
  }
  return (
    <Screen back title={t('student.classmates')} subtitle={me.data?.className ?? undefined} padded={false}>
      {classmates.isLoading && !classmates.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(p) => p.userId}
          ListEmptyComponent={<EmptyState icon="people-outline" title={t('common.emptyList')} />}
          renderItem={({ item }) => (
            <ListItem
              title={item.fullName}
              subtitle={item.className ?? undefined}
              left={<Avatar name={item.fullName} avatarKey={item.avatarKey} />}
              chevron
              onPress={() => openDm.mutate(item.userId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })}
            />
          )}
        />
      )}
    </Screen>
  );
}
