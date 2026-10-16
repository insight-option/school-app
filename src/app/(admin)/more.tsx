import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card, ListItem, Screen, SectionHeader, useTheme } from '../../ui';
import { ADMIN_SECTIONS } from './_layout';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../components/profile/ProfileSections';

/** Phone-only overflow: the sections that don't fit in the bottom bar, plus account settings. */
export default function AdminMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const rest = ADMIN_SECTIONS.filter((s) => !['dashboard', 'students', 'messages', 'feedback'].includes(s.name));
  return (
    <Screen title={t('common.more')} scroll maxWidth={720}>
      <ProfileHeader />
      <SectionHeader title={t('admin.sidebar')} />
      <Card padding={0}>
        {rest.map((s, i) => (
          <ListItem key={s.name} title={t(s.key)} left={<Ionicons name={s.icon as never} size={22} color={theme.colors.textMuted} />} chevron onPress={() => router.push(`/(admin)/${s.name}` as never)} style={i === rest.length - 1 ? { borderBottomWidth: 0 } : undefined} />
        ))}
      </Card>
      <LanguageSection />
      <AppearanceSection />
      <NotificationSection />
      <AccountSection />
    </Screen>
  );
}
