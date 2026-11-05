import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui';
import { BroadcastList } from '../../components/BroadcastList';
import { useMyProfile } from '../../features/profiles';
import { useBroadcastsForMe } from '../../features/engagement';
import { kv } from '../../lib/storage/mmkv';

/** When the teacher last opened the broadcasts (the class tab shows how many are newer). */
export const BROADCASTS_SEEN_KEY = 'teacher.broadcastsSeenAt';

export default function TeacherBroadcasts() {
  const { t } = useTranslation();
  const me = useMyProfile();
  const q = useBroadcastsForMe(me.data);
  const newest = q.data?.[0]?.postedAt;
  useEffect(() => {
    kv.setString(BROADCASTS_SEEN_KEY, newest ?? new Date().toISOString());
  }, [newest]);
  return (
    <Screen back title={t('teacher.broadcasts')} scroll refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BroadcastList items={q.data} loading={q.isLoading} />
    </Screen>
  );
}
