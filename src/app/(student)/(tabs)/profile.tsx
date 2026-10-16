import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, KeyValue, Screen, SectionHeader, Text, useTheme } from '../../../ui';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../../components/profile/ProfileSections';
import { useMyProfile } from '../../../features/profiles';
import { MapView } from '../../../components/map/MapView';

export default function StudentProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const me = useMyProfile();
  const home = me.data?.homeLocation;

  return (
    <Screen title={t('tabs.profile')} scroll maxWidth={720}>
      <ProfileHeader subtitle={[me.data?.className, me.data?.busName ? `${t('profile.bus')} ${me.data.busName}` : null].filter(Boolean).join(' · ')} />

      <SectionHeader title={t('common.details')} />
      <Card>
        <KeyValue label={t('profile.class')} value={me.data?.className} />
        <KeyValue label={t('profile.bus')} value={me.data?.busName} />
        <KeyValue label={t('student.parentContact')} value={[me.data?.parentEmail, me.data?.parentPhone].filter(Boolean).join(' · ')} />
      </Card>

      <SectionHeader title={t('student.homeLocation')} action={t('common.edit')} onAction={() => router.push('/(student)/home-location')} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {home ? (
          <View style={{ height: 160 }} pointerEvents="none">
            <MapView markers={[{ id: 'home', kind: 'home', lat: home.lat, lng: home.lng }]} initialRegion={{ lat: home.lat, lng: home.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }} />
          </View>
        ) : null}
        <View style={{ padding: theme.spacing.lg }}>
          <Text color="textMuted">{me.data?.homeAddress ?? (home ? `${home.lat.toFixed(5)}, ${home.lng.toFixed(5)}` : t('profile.homeLocationNotSet'))}</Text>
          <Button title={t('student.changeHome')} variant="ghost" size="sm" icon="location-outline" onPress={() => router.push('/(student)/home-location')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        </View>
      </Card>

      <LanguageSection />
      <AppearanceSection />
      <NotificationSection showTestAlarm />
      <AccountSection />
    </Screen>
  );
}
