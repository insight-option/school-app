import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, EmptyState, KeyValue, Screen, SectionHeader, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { useProfile } from '../../../features/profiles';
import { useFeedbackForStudent } from '../../../features/engagement';
import { useOpenDirectConversation } from '../../../features/messaging';
import { callPhone } from '../../../lib/util/device';

export default function TeacherStudentDetail() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = String(userId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useProfile(id);
  const feedback = useFeedbackForStudent(id);
  const openDm = useOpenDirectConversation();
  const p = profile.data;

  return (
    <Screen back title={p?.fullName ?? t('teacher.studentProfile')} scroll maxWidth={720}>
      <Card style={{ alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Avatar name={p?.fullName} avatarKey={p?.avatarKey} size={80} />
        <Text variant="title">{p?.fullName ?? '…'}</Text>
        <Text color="textMuted">
          {[p?.className, p?.busName ? `${t('teacher.bus')} ${p.busName}` : null].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: 4 }}>
          <Button title={t('teacher.sendFeedback')} icon="ribbon-outline" onPress={() => router.push({ pathname: '/(teacher)/send-feedback', params: { studentId: id, classId: p?.classId ?? '' } } as never)} />
          <Button title={t('common.message')} variant="secondary" icon="chatbubble-ellipses-outline" loading={openDm.isPending} onPress={() => openDm.mutate(id, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })} />
        </View>
      </Card>
      <SectionHeader title={t('teacher.parent')} />
      <Card>
        <KeyValue label={t('common.email')} value={p?.parentEmail} />
        <KeyValue label={t('common.phone')} value={p?.parentPhone} />
        {p?.parentPhone ? <Button title={t('common.call')} variant="outline" size="sm" icon="call" onPress={() => callPhone(p.parentPhone)} style={{ alignSelf: 'flex-start', marginTop: 8 }} /> : null}
      </Card>
      <SectionHeader title={t('teacher.feedbackHistory')} />
      {feedback.isLoading && !feedback.data ? (
        <SkeletonCard />
      ) : !feedback.data?.length ? (
        <EmptyState icon="ribbon-outline" title={t('teacher.noFeedback')} compact />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {feedback.data.map((f) => (
            <FeedbackCard key={f.id} item={f} />
          ))}
        </View>
      )}
    </Screen>
  );
}
