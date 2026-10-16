import React from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui';
import { BroadcastList } from '../../components/BroadcastList';
import { useMyProfile } from '../../features/profiles';
import { useBroadcastsForMe } from '../../features/engagement';

export default function TeacherBroadcasts() {
  const { t } = useTranslation();
  const me = useMyProfile();
  const q = useBroadcastsForMe(me.data);
  return (
    <Screen back title={t('teacher.broadcasts')} scroll refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BroadcastList items={q.data} loading={q.isLoading} />
    </Screen>
  );
}
