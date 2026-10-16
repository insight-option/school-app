import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Papa from 'papaparse';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ProgressBar, Screen, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useBuses, useClasses } from '../../../features/school';
import { useImportJob, useStartImport, type ImportRow } from '../../../features/ops';
import { isEmail, isUsername } from '../../../lib/validation';
import { downloadTextFile } from '../../../lib/util/device';
import { toCsv as rowsToCsv } from '../../../lib/util/format';

const TEMPLATE_COLUMNS = ['username', 'password', 'parentEmail', 'fullName', 'className', 'busId', 'parentPhone', 'homeAddress', 'grade'];
const BATCH = 400;

type ValidatedRow = { row: number; data: ImportRow; errors: string[] };

/** CSV template → upload → client-side validation → preview → async Lambda import → downloadable report. */
export default function AdminImportStudents() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const classes = useClasses();
  const buses = useBuses();
  const start = useStartImport();
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const job = useImportJob(jobIds[0]);

  const classNames = useMemo(() => new Set((classes.data ?? []).map((c) => c.name.trim().toLowerCase())), [classes.data]);
  const busIds = useMemo(() => new Set((buses.data ?? []).map((b) => b.busId.toLowerCase())), [buses.data]);

  const downloadTemplate = () => {
    const sample = [{ username: 'S-10001', password: '', parentEmail: 'parent@example.com', fullName: 'Sara Ahmed', className: classes.data?.[0]?.name ?? '3A', busId: buses.data?.[0]?.busId ?? 'BUS-01', parentPhone: '+966500000000', homeAddress: 'Street 1, District', grade: '3' }];
    void downloadTextFile('students-template.csv', rowsToCsv(sample, TEMPLATE_COLUMNS));
  };

  const chooseFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    let text = '';
    try {
      text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    const seen = new Set<string>();
    const validated: ValidatedRow[] = parsed.data.map((r, i) => {
      const data: ImportRow = {
        username: (r.username ?? '').trim(),
        password: (r.password ?? '').trim() || undefined,
        parentEmail: (r.parentEmail ?? '').trim(),
        fullName: (r.fullName ?? '').trim(),
        className: (r.className ?? '').trim() || undefined,
        busId: (r.busId ?? '').trim() || undefined,
        parentPhone: (r.parentPhone ?? '').trim() || undefined,
        homeAddress: (r.homeAddress ?? '').trim() || undefined,
        grade: (r.grade ?? '').trim() || undefined,
      };
      const errors: string[] = [];
      if (!isUsername(data.username)) errors.push(t('auth.schoolId'));
      if (seen.has(data.username.toLowerCase())) errors.push(t('admin.import.duplicateId'));
      seen.add(data.username.toLowerCase());
      if (!isEmail(data.parentEmail)) errors.push(t('admin.import.missingEmail'));
      if (data.fullName.length < 2) errors.push(t('common.fullName'));
      if (data.className && !classNames.has(data.className.toLowerCase())) errors.push(t('admin.import.unknownClass'));
      if (data.busId && !busIds.has(data.busId.toLowerCase())) errors.push(t('admin.import.unknownBus'));
      if (data.password && data.password.length < 8) errors.push(t('common.minChars', { count: 8 }));
      return { row: i + 2, data, errors };
    });
    setRows(validated);
  };

  const valid = rows?.filter((r) => !r.errors.length) ?? [];
  const invalid = rows?.filter((r) => r.errors.length) ?? [];

  const createAll = async () => {
    const ids: string[] = [];
    for (let i = 0; i < valid.length; i += BATCH) {
      const batch = valid.slice(i, i + BATCH).map((r) => r.data);
      try {
        const j = await start.mutateAsync({ rows: batch });
        ids.push(j.id);
      } catch (e) {
        toast.error((e as Error).message);
        break;
      }
    }
    setJobIds(ids);
  };

  const downloadReport = () => {
    const results = (typeof job.data?.results === 'string' ? (JSON.parse(job.data.results) as Record<string, unknown>[]) : ((job.data?.results as Record<string, unknown>[] | null) ?? [])) ?? [];
    void downloadTextFile(`import-report-${job.data?.id ?? 'job'}.csv`, rowsToCsv(results, ['row', 'username', 'status', 'password', 'error']));
  };

  const running = job.data && (job.data.status === 'PENDING' || job.data.status === 'RUNNING');

  return (
    <Screen back title={t('admin.import.title')} scroll maxWidth={900}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="subheading">{t('admin.import.step1')}</Text>
          <Text color="textMuted">{TEMPLATE_COLUMNS.join(', ')}</Text>
          <Text variant="caption" color="textMuted">
            {t('admin.import.passwordsNote')}
          </Text>
          <Button title={t('admin.import.downloadTemplate')} variant="outline" icon="download-outline" onPress={downloadTemplate} style={{ alignSelf: 'flex-start' }} />
        </Card>
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="subheading">{t('admin.import.step2')}</Text>
          <Button title={t('admin.import.chooseFile')} icon="document-attach-outline" onPress={chooseFile} style={{ alignSelf: 'flex-start' }} />
          {rows ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Badge label={t('admin.import.rows', { count: rows.length })} />
              <Badge label={t('admin.import.valid', { count: valid.length })} tone="success" />
              <Badge label={t('admin.import.invalid', { count: invalid.length })} tone={invalid.length ? 'danger' : 'neutral'} />
            </View>
          ) : null}
        </Card>
        {rows ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="subheading">{t('admin.import.step3')}</Text>
            <ScrollView horizontal>
              <View>
                <Row cells={['#', 'username', 'fullName', 'parentEmail', 'className', 'busId', t('common.status')]} header />
                {rows.slice(0, 60).map((r) => (
                  <Row key={r.row} cells={[String(r.row), r.data.username, r.data.fullName, r.data.parentEmail, r.data.className ?? '', r.data.busId ?? '', r.errors.join('; ') || '✓']} error={!!r.errors.length} />
                ))}
                {rows.length > 60 ? (
                  <Text variant="caption" color="textMuted" style={{ padding: 8 }}>
                    … {rows.length - 60}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
            {!jobIds.length ? <Button title={t('admin.import.createAll', { count: valid.length })} icon="cloud-upload-outline" disabled={!valid.length} loading={start.isPending} onPress={createAll} /> : null}
          </Card>
        ) : null}
        {jobIds.length && job.data ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="subheading">{running ? t('admin.import.running', { processed: job.data.processed ?? 0, total: job.data.total ?? 0 }) : t('admin.import.completed', { created: job.data.created ?? 0, failed: job.data.failed ?? 0 })}</Text>
            <ProgressBar value={job.data.total ? (job.data.processed ?? 0) / job.data.total : 0} color={job.data.status === 'FAILED' ? theme.colors.danger : undefined} />
            {job.data.error ? <Text color="danger">{job.data.error}</Text> : null}
            {jobIds.length > 1 ? (
              <Text variant="caption" color="textMuted">
                {jobIds.length} jobs
              </Text>
            ) : null}
            {!running ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={t('admin.import.downloadReport')} icon="download-outline" variant="outline" onPress={downloadReport} />
                <Button title={t('admin.students')} variant="secondary" onPress={() => router.replace('/(admin)/students')} />
              </View>
            ) : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function Row({ cells, header, error }: { cells: string[]; header?: boolean; error?: boolean }) {
  const theme = useTheme();
  const widths = [40, 110, 150, 200, 100, 100, 220];
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: error ? theme.colors.dangerSoft : undefined }}>
      {cells.map((c, i) => (
        <Text key={i} variant={header ? 'label' : 'caption'} color={header ? 'textMuted' : error && i === cells.length - 1 ? 'danger' : 'text'} numberOfLines={1} style={{ width: widths[i], padding: 6 }}>
          {c}
        </Text>
      ))}
    </View>
  );
}
