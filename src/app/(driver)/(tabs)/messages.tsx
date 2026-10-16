import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, Screen, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { InboxList } from '../../../components/chat/InboxList';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile } from '../../../features/profiles';
import { useOpenOfficeConversation } from '../../../features/messaging';

export default function DriverMessages() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const openOffice = useOpenOfficeConversation();
  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
      {me.data?.busId ? <Chip icon="bus" label={t('driver.busGroup')} onPress={() => router.push(`/chat/bus_${me.data!.busId}` as never)} /> : null}
      <Chip icon="business" label={t('student.schoolOffice')} onPress={() => openOffice.mutate(undefined, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })} />
    </ScrollView>
  );
  return (
    <Screen padded={false} title={t('tabs.messages')}>
      <View style={{ flex: 1 }}>
        <InboxList seatUserId={session.userId} header={header} />
      </View>
    </Screen>
  );
}
