import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, KeyValue, Screen, SectionHeader, Text, useTheme } from '../../../ui';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../../components/profile/ProfileSections';
import { useMyProfile } from '../../../features/profiles';
import { useBus } from '../../../features/school';

export default function DriverProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const me = useMyProfile();
  const bus = useBus(me.data?.busId);
  return (
    <Screen title={t('tabs.profile')} scroll maxWidth={720}>
      <ProfileHeader subtitle={bus.data ? `${t('profile.bus')} ${bus.data.plate}` : undefined} />
      <SectionHeader title={t('profile.bus')} />
      <Card>
        <KeyValue label={t('admin.plate')} value={bus.data?.plate} />
        <KeyValue label={t('admin.driverName')} value={bus.data?.driverName} />
        <KeyValue label={t('admin.driverPhone')} value={bus.data?.driverPhone} />
        <KeyValue label={t('admin.capacity')} value={bus.data ? t('admin.capacityUsage', { used: bus.data.studentCount ?? 0, capacity: bus.data.capacity ?? 0 }) : undefined} />
        <Text variant="caption" color="textFaint" style={{ marginTop: theme.spacing.sm }}>
          {t('driver.cannotEdit')}
        </Text>
      </Card>
      <LanguageSection />
      <AppearanceSection />
      <NotificationSection />
      <AccountSection />
    </Screen>
  );
}
