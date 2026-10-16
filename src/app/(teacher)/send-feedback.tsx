import React, { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { Screen, type SelectOption } from '../../ui';
import { FeedbackForm } from '../../components/FeedbackForm';
import { useSession } from '../../lib/auth/session';
import { useClassesByTeacher } from '../../features/school';
import { client, listAll, type Profile } from '../../lib/data/client';
import { qk } from '../../lib/query/client';

export default function TeacherSendFeedback() {
  const { studentId, classId } = useLocalSearchParams<{ studentId?: string; classId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const classes = useClassesByTeacher(session.userId);
  const rosters = useQueries({
    queries: (classes.data ?? []).map((c) => ({
      queryKey: qk.profilesByClass(c.id),
      queryFn: async () => (await listAll((nextToken) => client.models.Profile.listProfilesByClass({ classId: c.id }, { limit: 100, nextToken }))) as Profile[],
    })),
  });
  const options = useMemo<SelectOption[]>(() => {
    const out: SelectOption[] = [];
    rosters.forEach((r, i) => {
      const cls = classes.data?.[i];
      for (const p of r.data ?? []) if (p.role === 'STUDENT' && p.isActive !== false) out.push({ value: p.userId, label: p.fullName, subtitle: cls?.name });
    });
    const preferred = classId ? out.filter((o) => classes.data?.find((c) => c.name === o.subtitle)?.id === classId) : [];
    const rest = out.filter((o) => !preferred.includes(o));
    return [...preferred, ...rest];
  }, [rosters, classes.data, classId]);

  return (
    <Screen back title={t('teacher.sendFeedback')} scroll keyboard maxWidth={720}>
      <FeedbackForm studentOptions={options} initialStudentIds={studentId ? [String(studentId)] : []} confirmBeforeSend onSubmitted={() => router.back()} />
    </Screen>
  );
}
