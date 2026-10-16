import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, KeyValue, Screen, SectionHeader } from '../../../ui';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../../components/profile/ProfileSections';
import { useMyProfile } from '../../../features/profiles';
import { useClassesByTeacher } from '../../../features/school';
import { useSession } from '../../../lib/auth/session';

export default function TeacherProfile() {
  const { t } = useTranslation();
  const me = useMyProfile();
  const session = useSession();
  const classes = useClassesByTeacher(session.userId);
  return (
    <Screen title={t('tabs.profile')} scroll maxWidth={720}>
      <ProfileHeader subtitle={classes.data?.map((c) => c.name).join(', ')} />
      <SectionHeader title={t('common.details')} />
      <Card>
        <KeyValue label={t('common.email')} value={me.data?.email} />
        <KeyValue label={t('common.phone')} value={me.data?.phone} />
        <KeyValue label={t('tabs.classes')} value={classes.data?.map((c) => c.name).join(', ')} />
      </Card>
      <LanguageSection />
      <AppearanceSection />
      <NotificationSection />
      <AccountSection />
    </Screen>
  );
}
