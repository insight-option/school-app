import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, EmptyState, Input, KeyValue, Screen, SectionHeader, Select, Sheet, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { UserActions } from '../../../components/admin/UserActions';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { useAdminUpdateProfile, useProfile } from '../../../features/profiles';
import { useAssignTeacher, useClasses, useClassesByTeacher, useUpdateUserContact } from '../../../features/school';
import { useFeedbackByAuthor } from '../../../features/engagement';
import { useOpenOfficeConversation } from '../../../features/messaging';
import { isEmail } from '../../../lib/validation';

export default function AdminTeacherDetail() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = String(userId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useProfile(id);
  const classes = useClasses();
  const mine = useClassesByTeacher(id);
  const feedback = useFeedbackByAuthor(id);
  const assign = useAssignTeacher();
  const update = useAdminUpdateProfile();
  const contact = useUpdateUserContact();
  const openOffice = useOpenOfficeConversation();
  const p = profile.data;
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [classIds, setClassIds] = useState<string[]>([]);
  const openEdit = () => {
    if (p) setForm({ fullName: p.fullName, email: p.email ?? '', phone: p.phone ?? '' });
    setClassIds((mine.data ?? []).map((c) => c.id));
    setEdit(true);
  };

  const save = async () => {
    if (!p) return;
    if (!isEmail(form.email)) return toast.error(t('common.invalidEmail'));
    try {
      await update.mutateAsync({ userId: p.userId, fullName: form.fullName.trim(), phone: form.phone || null });
      if (form.email !== (p.email ?? '') || form.phone !== (p.phone ?? '')) await contact.mutateAsync({ username: p.username, email: form.email, phone: form.phone || undefined });
      const current = (mine.data ?? []).map((c) => c.id).sort().join(',');
      if (current !== [...classIds].sort().join(',')) await assign.mutateAsync({ teacherId: p.userId, classIds });
      toast.success(t('common.success'));
      setEdit(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Screen back title={p?.fullName ?? t('admin.teachers')} scroll maxWidth={880} right={p ? <Button size="sm" variant="secondary" icon="chatbubble-ellipses-outline" title={t('common.message')} loading={openOffice.isPending} onPress={() => openOffice.mutate(p.userId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })} /> : undefined}>
      {!p ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonCard />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Avatar name={p.fullName} avatarKey={p.avatarKey} size={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="title">{p.fullName}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Badge label={p.username} />
                <Badge label={p.isActive === false ? t('common.disabled') : t('common.active')} tone={p.isActive === false ? 'danger' : 'success'} />
                {(mine.data ?? []).map((c) => (
                  <Badge key={c.id} label={c.name} tone="primary" />
                ))}
              </View>
            </View>
            <Button size="sm" variant="outline" icon="create-outline" title={t('common.edit')} onPress={openEdit} />
          </Card>
          <Card>
            <KeyValue label={t('common.email')} value={p.email} />
            <KeyValue label={t('common.phone')} value={p.phone} />
            <KeyValue label={t('tabs.classes')} value={(mine.data ?? []).map((c) => `${c.name} (${c.studentCount ?? 0})`).join(', ') || t('admin.noClass')} />
          </Card>
          <UserActions profile={p} afterDelete="/(admin)/teachers" />
          <SectionHeader title={t('admin.feedback')} />
          {!feedback.data?.length ? <EmptyState icon="ribbon-outline" title={t('student.feedbackEmpty')} compact /> : feedback.data.slice(0, 10).map((f) => <FeedbackCard key={f.id} item={f} showStudent />)}
        </View>
      )}
      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('common.edit')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('common.fullName')} value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <Input label={t('common.email')} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
          <Input label={t('common.phone')} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
          <Select label={t('admin.assignClasses')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name, subtitle: c.teacherName && c.teacherId !== id ? `${t('admin.assignTeacher')}: ${c.teacherName}` : undefined }))} value={classIds} onChange={(v) => setClassIds((v as string[]) ?? [])} multiple searchable />
          <Button title={t('admin.save')} onPress={save} loading={update.isPending || contact.isPending || assign.isPending} />
        </View>
      </Sheet>
    </Screen>
  );
}
