import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Card, ConfirmSheet, Input, KeyValue, ListItem, Screen, SectionHeader, Select, Sheet, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { StudentPicker } from '../../../components/admin/StudentPicker';
import { flattenPages, useProfilesByClass, useProfilesByRole } from '../../../features/profiles';
import { useAssignStudents, useAssignTeacher, useClasses, useDeleteClass, useSaveClass } from '../../../features/school';

export default function AdminClassDetail() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const id = String(classId);
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const classes = useClasses();
  const cls = classes.data?.find((c) => c.id === id);
  const roster = useProfilesByClass(id);
  const teachers = useProfilesByRole('TEACHER');
  const assign = useAssignStudents();
  const assignTeacher = useAssignTeacher();
  const save = useSaveClass();
  const del = useDeleteClass();
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const openEdit = () => {
    if (cls) {
      setName(cls.name);
      setGrade(cls.grade ?? '');
      setTeacherId(cls.teacherId ?? null);
    }
    setEdit(true);
  };
  const currentIds = useMemo(() => (roster.data ?? []).filter((p) => p.role === 'STUDENT').map((p) => p.userId), [roster.data]);
  const teacherOptions = flattenPages(teachers.data?.pages).map((p) => ({ value: p.userId, label: p.fullName, subtitle: p.className ?? undefined }));

  const saveAssignment = async (ids: string[]) => {
    const add = ids.filter((x) => !currentIds.includes(x));
    const remove = currentIds.filter((x) => !ids.includes(x));
    try {
      if (add.length) await assign.mutateAsync({ studentIds: add, classId: id });
      if (remove.length) await assign.mutateAsync({ studentIds: remove, classId: '' });
      toast.success(t('common.success'));
      setPicker(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveClass = async () => {
    if (!cls) return;
    try {
      await save.mutateAsync({ id, name: name.trim(), grade: grade.trim() || null });
      if ((teacherId ?? '') !== (cls.teacherId ?? '')) {
        if (teacherId) {
          const teacher = flattenPages(teachers.data?.pages).find((p) => p.userId === teacherId);
          const existing = (teacher?.classIds ?? []).filter((c): c is string => !!c);
          await assignTeacher.mutateAsync({ teacherId, classIds: Array.from(new Set([...existing, id])) });
        } else if (cls.teacherId) {
          const prev = flattenPages(teachers.data?.pages).find((p) => p.userId === cls.teacherId);
          await assignTeacher.mutateAsync({ teacherId: cls.teacherId, classIds: (prev?.classIds ?? []).filter((c): c is string => !!c && c !== id) });
        }
      }
      toast.success(t('common.success'));
      setEdit(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Screen back title={cls?.name ?? t('admin.classes')} scroll maxWidth={880} right={cls ? <Button size="sm" variant="secondary" icon="people-outline" title={t('teacher.classGroup')} onPress={() => router.push(`/chat/class_${id}` as never)} /> : undefined}>
      {!cls ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonCard />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Card style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={cls.name} icon="library" size={56} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="title">{cls.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {cls.grade ? <Badge label={`${t('admin.grade')} ${cls.grade}`} /> : null}
                  <Badge label={t('common.students', { count: cls.studentCount ?? 0 })} tone="primary" />
                </View>
              </View>
              <Button size="sm" variant="outline" icon="create-outline" title={t('common.edit')} onPress={openEdit} />
            </View>
            <KeyValue label={t('admin.assignTeacher')} value={cls.teacherName ?? t('admin.noTeacher')} />
          </Card>
          <SectionHeader title={t('admin.roster')} action={t('admin.assignStudents')} onAction={() => setPicker(true)} />
          <Card padding={0}>
            {(roster.data ?? [])
              .filter((p) => p.role === 'STUDENT')
              .map((s) => (
                <ListItem key={s.userId} title={s.fullName} subtitle={[s.username, s.busName ? `${t('admin.bus')} ${s.busName}` : t('admin.noBus')].filter(Boolean).join(' · ')} left={<Avatar name={s.fullName} avatarKey={s.avatarKey} size={36} />} chevron onPress={() => router.push(`/(admin)/students/${s.userId}` as never)} />
              ))}
            {!roster.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('common.emptyList')}
              </Text>
            ) : null}
          </Card>
          <Button title={t('common.delete')} variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} disabled={(cls.studentCount ?? 0) > 0} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
      <StudentPicker visible={picker} onClose={() => setPicker(false)} title={t('admin.assignStudents')} initialSelected={currentIds} onConfirm={saveAssignment} loading={assign.isPending} />
      <Sheet visible={edit} onClose={() => setEdit(false)} title={t('common.edit')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label={t('admin.className')} value={name} onChangeText={setName} />
          <Input label={t('admin.grade')} value={grade} onChangeText={setGrade} />
          <Select label={t('admin.assignTeacher')} options={teacherOptions} value={teacherId} onChange={(v) => setTeacherId((v as string) || null)} searchable />
          <Button title={t('admin.save')} onPress={saveClass} loading={save.isPending || assignTeacher.isPending} />
        </View>
      </Sheet>
      <ConfirmSheet visible={confirmDelete} title={t('common.confirmDeleteTitle')} body={t('common.confirmDeleteBody')} confirmLabel={t('common.delete')} cancelLabel={t('common.cancel')} destructive loading={del.isPending} onCancel={() => setConfirmDelete(false)} onConfirm={() => del.mutate(id, { onSuccess: () => router.replace('/(admin)/classes'), onError: (e) => toast.error(e.message) })} />
    </Screen>
  );
}
