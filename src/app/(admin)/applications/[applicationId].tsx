import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Chip, EmptyState, Input, Screen, Skeleton, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { Avatar } from '../../../ui/Avatar';
import { APPLICATION_STATUSES, STATUS_TONE, useApplication, useReviewApplication } from '../../../features/admissions';
import { formatDate, formatDateTime } from '../../../lib/util/format';
import { callPhone, copyText } from '../../../lib/util/device';
import type { ApplicationStatus } from '../../../lib/data/client';

/** Office: one application – details, contact the family, decide, create the student account. */
export default function AdminApplicationDetail() {
  const { applicationId } = useLocalSearchParams<{ applicationId: string }>();
  const id = String(applicationId ?? '');
  const { t } = useTranslation();
  const theme = useTheme();
  const { spacing } = theme;
  const router = useRouter();
  const q = useApplication(id);
  const review = useReviewApplication();
  const app = q.data;
  const [decision, setDecision] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!app) {
    return (
      <Screen back title={t('admissions.title')}>
        {q.isLoading ? (
          <View style={{ gap: 12, paddingTop: spacing.lg }}>
            <Skeleton height={80} />
            <Skeleton height={200} />
          </View>
        ) : (
          <EmptyState icon="clipboard-outline" title={t('common.notFound')} />
        )}
      </Screen>
    );
  }

  const status = decision ?? app.status;
  const message = note ?? app.reviewerNote ?? '';
  const dirty = status !== app.status || message !== (app.reviewerNote ?? '');

  const save = () =>
    review.mutate(
      { applicationId: app.id, status, note: message.trim() || null },
      {
        onSuccess: () => {
          toast.success(t('admissions.saved'));
          setDecision(null);
          setNote(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const rows: [string, string | null | undefined][] = [
    [t('admissions.dob'), app.dateOfBirth ? formatDate(app.dateOfBirth) : null],
    [t('admissions.gender'), app.gender === 'MALE' ? t('apply.male') : app.gender === 'FEMALE' ? t('apply.female') : null],
    [t('admissions.grade'), app.gradeApplying],
    [t('admissions.currentSchool'), app.currentSchool],
    [t('admissions.transport'), app.needsTransport == null ? null : app.needsTransport ? t('admissions.yes') : t('admissions.no')],
  ];
  const parentRows: [string, string | null | undefined][] = [
    [t('admissions.parent'), app.parentName],
    [t('admissions.relationship'), app.relationship ? t(`apply.relationships.${app.relationship}`, { defaultValue: app.relationship }) : null],
    [t('admissions.email'), app.parentEmail],
    [t('admissions.phone'), app.parentPhone],
    [t('admissions.address'), app.address],
  ];

  return (
    <Screen back title={app.studentName} subtitle={`${t('admissions.reference')} ${app.reference}`} scroll keyboard maxWidth={760}>
      <Card style={[styles.head, { marginTop: spacing.md }]}>
        <Avatar name={app.studentName} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading">{app.studentName}</Text>
          <Text variant="caption" color="textMuted">
            {t('admissions.submittedOn', { date: formatDateTime(app.submittedAt) })}
          </Text>
        </View>
        <Badge label={t(`appStatus.statuses.${app.status}`)} tone={STATUS_TONE[app.status]} />
      </Card>

      <View style={[styles.actions, { marginTop: spacing.md }]}>
        <Button title={t('admissions.call')} icon="call-outline" variant="secondary" onPress={() => void callPhone(app.parentPhone)} style={{ flex: 1 }} />
        <Button title={t('admissions.emailAction')} icon="mail-outline" variant="secondary" onPress={() => void Linking.openURL(`mailto:${app.parentEmail}`)} style={{ flex: 1 }} />
        <Button title="" icon="copy-outline" variant="ghost" onPress={() => void copyText(app.reference, t('common.copied'))} />
      </View>

      <Card style={{ marginTop: spacing.md, gap: spacing.md }}>
        <Text variant="subheading">{t('admissions.student')}</Text>
        {rows.filter(([, v]) => !!v).map(([k, v]) => (
          <Field key={k} label={k} value={v!} />
        ))}
      </Card>

      <Card style={{ marginTop: spacing.md, gap: spacing.md }}>
        <Text variant="subheading">{t('admissions.parent')}</Text>
        {parentRows.filter(([, v]) => !!v).map(([k, v]) => (
          <Field key={k} label={k} value={v!} />
        ))}
        {app.notes ? <Field label={t('admissions.notes')} value={app.notes} /> : null}
      </Card>

      <Card style={{ marginTop: spacing.md, gap: spacing.md }}>
        <Text variant="subheading">{t('admissions.decision')}</Text>
        <View style={styles.chips}>
          {APPLICATION_STATUSES.map((s) => (
            <Chip key={s} label={t(`appStatus.statuses.${s}`)} selected={status === s} tone={s === 'ACCEPTED' ? 'success' : s === 'REJECTED' ? 'danger' : s === 'WAITLISTED' ? 'warning' : 'primary'} onPress={() => setDecision(s)} />
          ))}
        </View>
        <Input label={t('admissions.messageToFamily')} helper={t('admissions.messageHint')} value={message} onChangeText={setNote} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
        {app.reviewedBy ? (
          <Text variant="caption" color="textMuted">
            {t('admissions.reviewedBy', { name: app.reviewedBy })}
          </Text>
        ) : null}
        <Button title={t('admissions.save')} icon="checkmark-done" onPress={save} loading={review.isPending} disabled={!dirty} />
      </Card>

      {app.status === 'ACCEPTED' ? (
        <Button
          title={t('admissions.createStudent')}
          icon="person-add"
          size="lg"
          style={{ marginTop: spacing.lg }}
          onPress={() =>
            router.push({
              pathname: '/(admin)/students/new',
              params: { fullName: app.studentName, parentEmail: app.parentEmail, parentPhone: app.parentPhone, homeAddress: app.address ?? '' },
            } as never)
          }
        />
      ) : null}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
