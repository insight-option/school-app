import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, EmptyState, Input, Screen, SwitchRow, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { SchoolLogo } from '../../../components/media/StorageImage';
import { cleanList, useSchool, useSubmitApplication, type ApplicationForm } from '../../../features/directory';
import { acceptsApplications } from '../../../lib/directory';
import { cleanApplication, formatDobInput, validateApplication, type ApplicationErrors } from '../../../lib/applicationForm';
import { kv } from '../../../lib/storage/mmkv';
import { currentLanguage } from '../../../lib/i18n';
import { copyText, haptic } from '../../../lib/util/device';

const EMPTY: ApplicationForm = { studentName: '', parentName: '', parentEmail: '', parentPhone: '', dateOfBirth: '', gender: '', gradeApplying: '', relationship: '', address: '', currentSchool: '', notes: '', needsTransport: false };
const draftKey = (schoolId: string) => `apply.draft.${schoolId}`;

type Receipt = { reference: string; schoolName: string; email: string };

export default function ApplyScreen() {
  const { schoolId: rawId } = useLocalSearchParams<{ schoolId: string }>();
  const schoolId = String(rawId ?? '');
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const q = useSchool(schoolId);
  const school = q.data;
  const submit = useSubmitApplication();
  const [form, setForm] = useState<ApplicationForm>(() => ({ ...EMPTY, ...(kv.getJSON<ApplicationForm>(draftKey(schoolId)) ?? {}) }));
  const [restored] = useState(() => !!kv.getJSON<ApplicationForm>(draftKey(schoolId))?.studentName);
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    if (restored) toast.info(t('apply.draftRestored'));
  }, [restored, t]);

  // Keep an unfinished application on the device (survives closing the app).
  useEffect(() => {
    if (!receipt && schoolId) kv.setJSON(draftKey(schoolId), form);
  }, [form, receipt, schoolId]);

  const set = <K extends keyof ApplicationForm>(k: K, v: ApplicationForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const err = (k: keyof ApplicationForm) => (errors[k] ? t(`apply.errors.${errors[k]}`) : null);

  if (!school) {
    return (
      <Screen back title={t('schoolPage.apply')}>
        {q.isLoading ? null : <EmptyState icon="school-outline" title={t('schoolPage.notFound')} actionLabel={t('schoolPage.backToSchools')} onAction={() => router.replace('/')} />}
      </Screen>
    );
  }

  if (receipt) {
    return (
      <Screen maxWidth={560} contentStyle={{ justifyContent: 'center', flex: 1 }}>
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxxl }}>
          <View style={[styles.successIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          </View>
          <Text variant="title" align="center">
            {t('apply.successTitle')}
          </Text>
          <Text color="textMuted" align="center">
            {t('apply.successBody')}
          </Text>
          <Card style={{ alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="captionStrong" color="textMuted">
              {t('apply.reference')}
            </Text>
            <Text variant="display" selectable style={{ letterSpacing: 2 }}>
              {receipt.reference}
            </Text>
            <Text variant="caption" color="textMuted">
              {receipt.schoolName}
            </Text>
            <Button title={t('apply.copy')} icon="copy-outline" variant="secondary" size="sm" onPress={() => void copyText(receipt.reference, t('common.copied'))} />
          </Card>
          <Button
            title={t('apply.checkStatus')}
            icon="search-outline"
            fullWidth
            size="lg"
            onPress={() => router.replace({ pathname: '/application-status', params: { reference: receipt.reference, email: receipt.email } } as never)}
          />
          <Button title={t('apply.backToSchools')} variant="ghost" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  const open = acceptsApplications(school);
  const grades = cleanList(school.gradeOptions);

  const onSubmit = () => {
    const e = validateApplication(form);
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      haptic('error');
      toast.error(t('common.fixErrors'));
      return;
    }
    const application = cleanApplication({ ...form, language: currentLanguage() });
    submit.mutate(
      { schoolId, application },
      {
        onSuccess: (r) => {
          if (!r) return;
          haptic('success');
          kv.delete(draftKey(schoolId));
          setReceipt({ reference: r.reference, schoolName: r.schoolName, email: application.parentEmail });
        },
        onError: (e2) => toast.error(e2.message),
      },
    );
  };

  return (
    <Screen back title={t('schoolPage.apply')} scroll keyboard maxWidth={680}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <SchoolLogo logoKey={school.logoKey} name={school.name} color={school.primaryColor} size={52} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={2}>
            {t('apply.title', { school: school.name })}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('apply.subtitle')}
          </Text>
        </View>
      </View>

      {!open ? (
        <Card tone="warning" style={{ marginTop: spacing.lg }}>
          <Text variant="bodyStrong">{t('apply.closed')}</Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
          <Card style={{ gap: spacing.md }}>
            <SectionTitle icon="person-outline" title={t('apply.student')} />
            <Input label={t('apply.studentName')} required value={form.studentName} onChangeText={(v) => set('studentName', v)} error={err('studentName')} autoCapitalize="words" testID="apply-student-name" />
            <Input
              label={t('apply.dob')}
              placeholder={t('apply.dobHint')}
              value={form.dateOfBirth}
              onChangeText={(v) => set('dateOfBirth', formatDobInput(v))}
              keyboardType="number-pad"
              maxLength={10}
              error={err('dateOfBirth')}
            />
            <Text variant="captionStrong" color="textMuted">
              {t('apply.gender')}
            </Text>
            <View style={styles.chips}>
              <Chip label={t('apply.male')} icon="male" selected={form.gender === 'MALE'} onPress={() => set('gender', form.gender === 'MALE' ? '' : 'MALE')} />
              <Chip label={t('apply.female')} icon="female" selected={form.gender === 'FEMALE'} onPress={() => set('gender', form.gender === 'FEMALE' ? '' : 'FEMALE')} />
            </View>
            {grades.length ? (
              <>
                <Text variant="captionStrong" color="textMuted">
                  {t('apply.grade')}
                </Text>
                <View style={styles.chips}>
                  {grades.map((g) => (
                    <Chip key={g} label={g} selected={form.gradeApplying === g} onPress={() => set('gradeApplying', form.gradeApplying === g ? '' : g)} />
                  ))}
                </View>
              </>
            ) : (
              <Input label={t('apply.grade')} placeholder={t('apply.gradePlaceholder')} value={form.gradeApplying} onChangeText={(v) => set('gradeApplying', v)} />
            )}
            <Input label={t('apply.currentSchool')} value={form.currentSchool} onChangeText={(v) => set('currentSchool', v)} />
          </Card>

          <Card style={{ gap: spacing.md }}>
            <SectionTitle icon="people-outline" title={t('apply.parent')} />
            <Input label={t('apply.parentName')} required value={form.parentName} onChangeText={(v) => set('parentName', v)} error={err('parentName')} autoCapitalize="words" textContentType="name" testID="apply-parent-name" />
            <Text variant="captionStrong" color="textMuted">
              {t('apply.relationship')}
            </Text>
            <View style={styles.chips}>
              {(['mother', 'father', 'guardian'] as const).map((r) => (
                <Chip key={r} label={t(`apply.relationships.${r}`)} selected={form.relationship === r} onPress={() => set('relationship', form.relationship === r ? '' : r)} />
              ))}
            </View>
            <Input
              label={t('apply.email')}
              required
              value={form.parentEmail}
              onChangeText={(v) => set('parentEmail', v)}
              error={err('parentEmail')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              leftIcon="mail-outline"
              testID="apply-email"
            />
            <Input
              label={t('apply.phone')}
              required
              value={form.parentPhone}
              onChangeText={(v) => set('parentPhone', v)}
              error={err('parentPhone')}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              leftIcon="call-outline"
              testID="apply-phone"
            />
            <Input label={t('apply.address')} value={form.address} onChangeText={(v) => set('address', v)} multiline />
            {school.transportAvailable ? <SwitchRow label={t('apply.needsTransport')} value={!!form.needsTransport} onValueChange={(v) => set('needsTransport', v)} /> : null}
            <Input label={t('apply.notes')} value={form.notes} onChangeText={(v) => set('notes', v)} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: 'top' }} />
          </Card>

          <Text variant="caption" color="textMuted">
            {t('apply.consent')}
          </Text>
          <Button title={submit.isPending ? t('apply.submitting') : t('apply.submit')} icon="send" size="lg" fullWidth loading={submit.isPending} onPress={onSubmit} testID="apply-submit" />
        </View>
      )}
    </Screen>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text variant="subheading">{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
});
