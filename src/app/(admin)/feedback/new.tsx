import React, { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../../ui';
import { FeedbackForm } from '../../../components/FeedbackForm';
import { flattenPages, useProfilesByRole } from '../../../features/profiles';

export default function AdminNewFeedback() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const students = useProfilesByRole('STUDENT');
  const options = useMemo(() => flattenPages(students.data?.pages).filter((p) => p.isActive !== false).map((p) => ({ value: p.userId, label: p.fullName, subtitle: [p.username, p.className].filter(Boolean).join(' · ') })), [students.data]);
  return (
    <Screen back title={t('admin.newFeedback')} scroll keyboard maxWidth={720}>
      <FeedbackForm studentOptions={options} initialStudentIds={studentId ? [String(studentId)] : []} onSubmitted={() => router.back()} />
    </Screen>
  );
}
