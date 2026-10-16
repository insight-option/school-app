import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, Screen, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { InboxList } from '../../../components/chat/InboxList';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { useBus, useClasses } from '../../../features/school';
import { useOpenDirectConversation, useOpenOfficeConversation } from '../../../features/messaging';

export default function StudentMessages() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const classes = useClasses();
  const bus = useBus(me.data?.busId);
  const openDm = useOpenDirectConversation();
  const openOffice = useOpenOfficeConversation();
  const myClass = classes.data?.find((c) => c.id === me.data?.classId);

  const go = (p: Promise<{ id: string } | null | undefined>) => p.then((c) => c && router.push(`/chat/${c.id}` as never)).catch((e: Error) => toast.error(e.message));

  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
      {myClass?.conversationId || me.data?.classId ? <Chip icon="people" label={t('student.classGroup')} onPress={() => router.push(`/chat/class_${me.data!.classId}` as never)} /> : null}
      {settings.data?.studentChatEnabled !== false && me.data?.classId ? <Chip icon="person-add" label={t('student.classmates')} onPress={() => router.push('/(student)/classmates')} /> : null}
      {myClass?.teacherId ? <Chip icon="school" label={t('student.teacher')} onPress={() => go(openDm.mutateAsync(myClass.teacherId!))} /> : null}
      {bus.data?.driverUserId ? <Chip icon="bus" label={t('student.busDriver')} onPress={() => go(openDm.mutateAsync(bus.data!.driverUserId!))} /> : null}
      <Chip icon="business" label={t('student.schoolOffice')} onPress={() => go(openOffice.mutateAsync(undefined))} />
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
