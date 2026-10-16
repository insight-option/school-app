import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, EmptyState, Input, KeyValue, ListItem, Screen, SectionHeader, Select, Sheet, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { UserActions } from '../../../components/admin/UserActions';
import { FeedbackCard } from '../../../components/FeedbackCard';
import { HomeLocationPicker } from '../../../components/map/HomeLocationPicker';
import { MapView } from '../../../components/map/MapView';
import { STOP_TONES } from '../../../components/StopTimeline';
import { useAdminUpdateProfile, useProfile, useUpdateHomeLocation } from '../../../features/profiles';
import { useAssignStudents, useBuses, useClasses, useUpdateUserContact } from '../../../features/school';
import { useFeedbackForStudent } from '../../../features/engagement';
import { useStudentStops } from '../../../features/trips';
import { useOpenOfficeConversation } from '../../../features/messaging';
import { useSettings } from '../../../features/settings';
import { formatDate, formatTime } from '../../../lib/util/format';
import { isEmail } from '../../../lib/validation';

export default function AdminStudentDetail() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = String(userId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useProfile(id);
  const classes = useClasses();
  const buses = useBuses();
  const settings = useSettings();
  const feedback = useFeedbackForStudent(id);
  const stops = useStudentStops(id);
  const assign = useAssignStudents();
  const updateProfile = useAdminUpdateProfile();
  const updateContact = useUpdateUserContact();
  const updateHome = useUpdateHomeLocation();
  const openOffice = useOpenOfficeConversation();
  const p = profile.data;

  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ fullName: '', parentEmail: '', parentPhone: '', homeAddress: '', grade: '', classId: '', busId: '' });
  const [homeOpen, setHomeOpen] = useState(false);
  const openEdit = () => {
    if (p) setForm({ fullName: p.fullName, parentEmail: p.parentEmail ?? '', parentPhone: p.parentPhone ?? '', homeAddress: p.homeAddress ?? '', grade: p.grade ?? '', classId: p.classId ?? '', busId: p.busId ?? '' });
    setEdit(true);
  };

  const save = async () => {
    if (!p) return;
    if (!isEmail(form.parentEmail)) return toast.error(t('common.invalidEmail'));
    try {
      await updateProfile.mutateAsync({ userId: p.userId, fullName: form.fullName.trim(), parentPhone: form.parentPhone || null, homeAddress: form.homeAddress || null, grade: form.grade || null });
      if (form.parentEmail !== (p.parentEmail ?? '')) await updateContact.mutateAsync({ username: p.username, email: form.parentEmail });
      if (form.classId !== (p.classId ?? '') || form.busId !== (p.busId ?? '')) await assign.mutateAsync({ studentIds: [p.userId], classId: form.classId, busId: form.busId });
      toast.success(t('common.success'));
      setEdit(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const bus = buses.data?.find((b) => b.busId === form.busId);

  return (
    <Screen back title={p?.fullName ?? t('admin.studentDetails')} scroll maxWidth={880} right={p ? <Button size="sm" variant="secondary" icon="chatbubble-ellipses-outline" title={t('common.message')} loading={openOffice.isPending} onPress={() => openOffice.mutate(p.userId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })} /> : undefined}>
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
                <Badge label={p.className ?? t('admin.noClass')} tone="primary" />
                <Badge label={p.busName ? `${t('admin.bus')} ${p.busName}` : t('admin.noBus')} tone="accent" />
                <Badge label={p.isActive === false ? t('common.disabled') : t('common.active')} tone={p.isActive === false ? 'danger' : 'success'} />
              </View>
            </View>
            <Button size="sm" variant="outline" icon="create-outline" title={t('common.edit')} onPress={openEdit} />
          </Card>

          <Card>
            <KeyValue label={t('admin.parentEmail')} value={p.parentEmail} />
            <KeyValue label={t('admin.parentPhone')} value={p.parentPhone} />
            <KeyValue label={t('admin.grade')} value={p.grade} />
            <KeyValue label={t('admin.homeAddress')} value={p.homeAddress} />
            <KeyValue label={t('common.language')} value={p.language} />
          </Card>

          <SectionHeader title={t('admin.homeLocation')} action={t('admin.setHome')} onAction={() => setHomeOpen(true)} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {p.homeLocation ? (
              <View style={{ height: 200 }} pointerEvents="none">
                <MapView markers={[{ id: 'home', kind: 'home', lat: p.homeLocation.lat, lng: p.homeLocation.lng }]} initialRegion={{ ...p.homeLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }} />
              </View>
            ) : (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('profile.homeLocationNotSet')}
              </Text>
            )}
          </Card>

          <UserActions profile={p} afterDelete="/(admin)/students" />

          <SectionHeader title={t('admin.tripHistory')} />
          <Card padding={0}>
            {!stops.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('trips.noTrips')}
              </Text>
            ) : (
              stops.data.slice(0, 20).map((s) => (
                <ListItem
                  key={s.id}
                  title={formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  subtitle={[s.alarmedAt ? `${t('trips.alarmedAt')} ${formatTime(s.alarmedAt, settings.data?.timezone)}` : null, s.boardedAt ? `${t('trips.boardedAt')} ${formatTime(s.boardedAt, settings.data?.timezone)}` : null, s.droppedAt ? `${t('trips.stopStatuses.DROPPED')} ${formatTime(s.droppedAt, settings.data?.timezone)}` : null].filter(Boolean).join(' · ') || undefined}
                  right={<Badge label={t(`trips.stopStatuses.${s.status}`)} tone={STOP_TONES[s.status]} size="sm" />}
                  onPress={() => router.push(`/(admin)/trips/${s.tripId}` as never)}
                  chevron
                />
              ))
            )}
          </Card>

          <SectionHeader title={t('admin.viewFeedback')} action={t('admin.newFeedback')} onAction={() => router.push({ pathname: '/(admin)/feedback/new', params: { studentId: p.userId } } as never)} />
          {!feedback.data?.length ? <EmptyState icon="ribbon-outline" title={t('teacher.noFeedback')} compact /> : feedback.data.map((f) => <FeedbackCard key={f.id} item={f} />)}
        </View>
      )}

      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('admin.editStudent')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('common.fullName')} value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <Input label={t('admin.parentEmail')} value={form.parentEmail} onChangeText={(v) => setForm((f) => ({ ...f, parentEmail: v }))} keyboardType="email-address" autoCapitalize="none" />
          <Input label={t('admin.parentPhone')} value={form.parentPhone} onChangeText={(v) => setForm((f) => ({ ...f, parentPhone: v }))} keyboardType="phone-pad" />
          <Input label={t('admin.grade')} value={form.grade} onChangeText={(v) => setForm((f) => ({ ...f, grade: v }))} />
          <Input label={t('admin.homeAddress')} value={form.homeAddress} onChangeText={(v) => setForm((f) => ({ ...f, homeAddress: v }))} />
          <Select label={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={form.classId || null} onChange={(v) => setForm((f) => ({ ...f, classId: (v as string) ?? '' }))} searchable />
          <Select label={t('admin.bus')} options={(buses.data ?? []).map((b) => ({ value: b.busId, label: `${b.plate} · ${b.driverName}`, subtitle: t('admin.capacityUsage', { used: b.studentCount ?? 0, capacity: b.capacity ?? 0 }) }))} value={form.busId || null} onChange={(v) => setForm((f) => ({ ...f, busId: (v as string) ?? '' }))} searchable />
          {bus && form.busId !== (p?.busId ?? '') && (bus.studentCount ?? 0) >= (bus.capacity ?? 0) ? (
            <Text variant="caption" color="danger">
              {t('admin.capacityExceeded', { count: (bus.studentCount ?? 0) + 1 - (bus.capacity ?? 0) })}
            </Text>
          ) : null}
          <Button title={t('admin.save')} onPress={save} loading={updateProfile.isPending || updateContact.isPending || assign.isPending} />
        </View>
      </Sheet>

      <Sheet visible={homeOpen} onClose={() => setHomeOpen(false)} title={t('admin.setHome')} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker initial={p?.homeLocation ?? null} initialAddress={p?.homeAddress} fallbackCenter={settings.data?.schoolLocation ?? null} busy={updateHome.isPending} confirmLabel={t('common.save')} onConfirm={(v) => updateHome.mutate({ ...v, userId: id }, { onSuccess: () => setHomeOpen(false), onError: (e) => toast.error(e.message) })} />
        </View>
      </Sheet>
    </Screen>
  );
}
