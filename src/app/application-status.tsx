import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Screen, Text, useTheme } from '../ui';
import { useCheckApplication, type ApplicationLookup } from '../features/directory';
import { formatDate } from '../lib/util/format';
import type { ApplicationStatus } from '../lib/data/client';

const STEPS: ApplicationStatus[] = ['NEW', 'REVIEWING', 'ACCEPTED'];

/** Public: a family looks up their application with the reference and e-mail (no account). */
export default function ApplicationStatusScreen() {
  const params = useLocalSearchParams<{ reference?: string; email?: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const check = useCheckApplication();
  const [reference, setReference] = useState(String(params.reference ?? ''));
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [result, setResult] = useState<ApplicationLookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (ref = reference, mail = email) => {
    setError(null);
    if (!ref.trim() || !mail.trim()) {
      setError(t('common.requiredField'));
      return;
    }
    check.mutate(
      { reference: ref.trim().toUpperCase(), email: mail.trim() },
      { onSuccess: (r) => setResult(r), onError: (e) => setError(e.message) },
    );
  };

  // Arriving from the "application sent" screen: look it up straight away.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !params.reference || !params.email) return;
    autoRan.current = true;
    check.mutate({ reference: String(params.reference), email: String(params.email) }, { onSuccess: (r) => setResult(r), onError: (e) => setError(e.message) });
  }, [params.reference, params.email, check]);

  const tone = (s: ApplicationStatus) => (s === 'ACCEPTED' ? colors.success : s === 'REJECTED' ? colors.danger : s === 'WAITLISTED' ? colors.warning : colors.primary);
  const icon = (s: ApplicationStatus): keyof typeof Ionicons.glyphMap =>
    s === 'ACCEPTED' ? 'checkmark-circle' : s === 'REJECTED' ? 'close-circle' : s === 'WAITLISTED' ? 'hourglass' : s === 'REVIEWING' ? 'eye' : 'mail-open';

  return (
    <Screen back title={t('appStatus.title')} scroll keyboard maxWidth={560}>
      <Text color="textMuted" style={{ marginTop: spacing.sm }}>
        {t('appStatus.subtitle')}
      </Text>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <Input
          label={t('appStatus.reference')}
          placeholder={t('appStatus.referencePlaceholder')}
          value={reference}
          onChangeText={(v) => setReference(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          leftIcon="pricetag-outline"
        />
        <Input
          label={t('appStatus.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon="mail-outline"
          error={error}
          returnKeyType="search"
          onSubmitEditing={() => run()}
        />
        <Button title={t('appStatus.check')} icon="search" size="lg" fullWidth loading={check.isPending} onPress={() => run()} />
      </View>

      {result ? (
        <Card style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <View style={styles.row}>
            <View style={[styles.statusIcon, { backgroundColor: `${tone(result.status)}22` }]}>
              <Ionicons name={icon(result.status)} size={30} color={tone(result.status)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                {result.reference}
              </Text>
              <Text variant="title" style={{ color: tone(result.status) }}>
                {t(`appStatus.statuses.${result.status}`)}
              </Text>
            </View>
          </View>
          <Text>{t(`appStatus.statusBody.${result.status}`)}</Text>

          {result.status !== 'REJECTED' && result.status !== 'WAITLISTED' ? (
            <View style={styles.progress}>
              {STEPS.map((s, i) => {
                const reached = STEPS.indexOf(result.status) >= i;
                return (
                  <React.Fragment key={s}>
                    <View style={[styles.stepDot, { backgroundColor: reached ? colors.success : colors.border }]}>
                      {reached ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                    </View>
                    {i < STEPS.length - 1 ? <View style={[styles.stepLine, { backgroundColor: STEPS.indexOf(result.status) > i ? colors.success : colors.border }]} /> : null}
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}

          <View style={styles.grid}>
            <Field label={t('appStatus.student')} value={result.studentName} />
            <Field label={t('appStatus.school')} value={result.schoolName} />
            <Field label={t('appStatus.submitted')} value={formatDate(result.submittedAt)} />
            {result.reviewedAt ? <Field label={t('appStatus.updated')} value={formatDate(result.reviewedAt)} /> : null}
          </View>
          {result.message ? (
            <View style={[styles.message, { backgroundColor: colors.surfaceAlt }]}>
              <Text variant="captionStrong" color="textMuted">
                {t('appStatus.message')}
              </Text>
              <Text>{result.message}</Text>
            </View>
          ) : null}
          <Button title={t('schoolPage.backToSchools')} variant="ghost" onPress={() => router.push(`/schools/${result.schoolId}` as never)} />
        </Card>
      ) : null}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: '45%', flexGrow: 1, gap: 2 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 3, borderRadius: 2, marginHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  message: { padding: 12, borderRadius: 12, gap: 4 },
});
