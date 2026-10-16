import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, Input, KeyValue, ListItem, Screen, SectionHeader, Sheet, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import type { MapMarker } from '../../../components/map/types';
import { StudentPicker } from '../../../components/admin/StudentPicker';
import { UserActions } from '../../../components/admin/UserActions';
import { useProfile, useProfilesByBus } from '../../../features/profiles';
import { useAssignStudents, useBus, useUpdateBus } from '../../../features/school';
import { useSettings } from '../../../features/settings';
import { useTripHistory } from '../../../features/trips';
import { initials } from '../../../ui/theme';
import { formatDate, formatTime } from '../../../lib/util/format';

export default function AdminBusDetail() {
  const { busId } = useLocalSearchParams<{ busId: string }>();
  const id = String(busId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const bus = useBus(id);
  const driver = useProfile(bus.data?.driverUserId);
  const students = useProfilesByBus(id);
  const settings = useSettings();
  const trips = useTripHistory(id, 14);
  const assign = useAssignStudents();
  const updateBus = useUpdateBus();
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ plate: '', driverName: '', driverPhone: '', capacity: '40' });
  const openEdit = () => {
    if (bus.data) setForm({ plate: bus.data.plate, driverName: bus.data.driverName, driverPhone: bus.data.driverPhone ?? '', capacity: String(bus.data.capacity ?? 40) });
    setEdit(true);
  };

  const markers: MapMarker[] = (students.data ?? [])
    .filter((s) => s.homeLocation)
    .map((s) => ({ id: s.userId, kind: 'student' as const, lat: s.homeLocation!.lat, lng: s.homeLocation!.lng, initials: initials(s.fullName), color: theme.colors.markerGoing, title: s.fullName, onPress: () => router.push(`/(admin)/students/${s.userId}` as never) }));
  if (settings.data?.schoolLocation) markers.push({ id: 'school', kind: 'school', lat: settings.data.schoolLocation.lat, lng: settings.data.schoolLocation.lng, color: theme.colors.markerSchool });

  const currentIds = useMemo(() => (students.data ?? []).map((s) => s.userId), [students.data]);

  const saveAssignment = async (ids: string[]) => {
    const add = ids.filter((x) => !currentIds.includes(x));
    const remove = currentIds.filter((x) => !ids.includes(x));
    try {
      if (add.length) await assign.mutateAsync({ studentIds: add, busId: id });
      if (remove.length) await assign.mutateAsync({ studentIds: remove, busId: '' });
      toast.success(t('common.success'));
      setPicker(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const b = bus.data;
  return (
    <Screen back title={b ? `${b.plate}` : t('admin.buses')} subtitle={b?.driverName} scroll maxWidth={960}>
      {!b ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonCard />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Card style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={b.plate} icon="bus" size={56} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{b.plate}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Badge label={b.busId} />
                  <Badge label={t('admin.capacityUsage', { used: b.studentCount ?? 0, capacity: b.capacity ?? 0 })} tone={(b.studentCount ?? 0) > (b.capacity ?? 0) ? 'danger' : 'success'} />
                  <Badge label={b.isActive === false ? t('common.disabled') : t('common.active')} tone={b.isActive === false ? 'danger' : 'success'} />
                </View>
              </View>
              <Button size="sm" variant="outline" icon="create-outline" title={t('common.edit')} onPress={openEdit} />
            </View>
            <KeyValue label={t('admin.driverName')} value={b.driverName} />
            <KeyValue label={t('admin.driverPhone')} value={b.driverPhone} />
          </Card>

          <SectionHeader title={t('admin.assignStudents')} action={t('common.edit')} onAction={() => setPicker(true)} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <View style={{ height: 260 }}>
              <MapView markers={markers} initialRegion={settings.data?.schoolLocation ? { ...settings.data.schoolLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined} />
            </View>
            {(students.data ?? []).map((s) => (
              <ListItem key={s.userId} title={s.fullName} subtitle={[s.username, s.className, s.homeAddress].filter(Boolean).join(' · ')} left={<Avatar name={s.fullName} avatarKey={s.avatarKey} size={36} />} chevron onPress={() => router.push(`/(admin)/students/${s.userId}` as never)} />
            ))}
            {!students.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('driver.noStudents')}
              </Text>
            ) : null}
          </Card>

          {driver.data ? <UserActions profile={driver.data} afterDelete="/(admin)/buses" /> : null}

          <SectionHeader title={t('admin.trips')} action={t('common.seeAll')} onAction={() => router.push('/(admin)/trips')} />
          <Card padding={0}>
            {!trips.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('trips.noTrips')}
              </Text>
            ) : (
              trips.data.slice(0, 10).map((tr) => (
                <ListItem key={tr.id} title={`${formatDate(tr.date)} · ${t(`trips.types.${tr.type}`)}`} subtitle={`${formatTime(tr.startedAt, settings.data?.timezone)} – ${formatTime(tr.endedAt, settings.data?.timezone)} · ${tr.boardedCount ?? 0}/${tr.stopCount ?? 0}`} right={<Badge label={t(`trips.statuses.${tr.status}`)} tone={tr.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm" />} chevron onPress={() => router.push(`/(admin)/trips/${tr.id}` as never)} />
              ))
            )}
          </Card>
        </View>
      )}

      <StudentPicker visible={picker} onClose={() => setPicker(false)} title={t('admin.assignStudents')} initialSelected={currentIds} capacity={b?.capacity ?? null} onConfirm={saveAssignment} loading={assign.isPending} />

      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('common.edit')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('admin.plate')} value={form.plate} onChangeText={(v) => setForm((f) => ({ ...f, plate: v }))} />
          <Input label={t('admin.driverName')} value={form.driverName} onChangeText={(v) => setForm((f) => ({ ...f, driverName: v }))} />
          <Input label={t('admin.driverPhone')} value={form.driverPhone} onChangeText={(v) => setForm((f) => ({ ...f, driverPhone: v }))} keyboardType="phone-pad" />
          <Input label={t('admin.capacity')} value={form.capacity} onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))} keyboardType="number-pad" />
          <Button
            title={t('admin.save')}
            loading={updateBus.isPending}
            onPress={() =>
              updateBus.mutate(
                { busId: id, plate: form.plate.trim(), driverName: form.driverName.trim(), driverPhone: form.driverPhone || null, capacity: Math.max(1, Number(form.capacity) || 40) },
                { onSuccess: () => setEdit(false), onError: (e) => toast.error(e.message) },
              )
            }
          />
        </View>
      </Sheet>
    </Screen>
  );
}
