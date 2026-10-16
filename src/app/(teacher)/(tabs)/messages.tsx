import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, Screen, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { InboxList } from '../../../components/chat/InboxList';
import { useSession } from '../../../lib/auth/session';
import { useClassesByTeacher } from '../../../features/school';
import { useOpenOfficeConversation } from '../../../features/messaging';

export default function TeacherMessages() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const classes = useClassesByTeacher(session.userId);
  const openOffice = useOpenOfficeConversation();
  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
      {(classes.data ?? []).map((c) => (
        <Chip key={c.id} icon="people" label={c.name} onPress={() => router.push(`/chat/class_${c.id}` as never)} />
      ))}
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
