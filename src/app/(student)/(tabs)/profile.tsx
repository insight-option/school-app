import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card, KeyValue, Screen, SectionHeader, Text, useTheme } from '../../../ui';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../../components/profile/ProfileSections';
import { StudentTopBar } from '../../../components/places/PickupSwitcher';
import { useMyProfile } from '../../../features/profiles';
import { PLACE_ICONS, displayPlaces, isActivePlace, placeKind, placeLine, useSavedPlaces } from '../../../features/places';
import { MapView } from '../../../components/map/MapView';

export default function StudentProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const me = useMyProfile();
  const places = useSavedPlaces();
  const list = displayPlaces(places.data, me.data);
  const home = me.data?.homeLocation;
  const openPlaces = () => router.push('/(student)/places' as never);

  return (
    <Screen topBar={<StudentTopBar />} title={t('tabs.profile')} scroll maxWidth={720}>
      <ProfileHeader subtitle={[me.data?.className, me.data?.busName ? `${t('profile.bus')} ${me.data.busName}` : null].filter(Boolean).join(' · ')} />

      <SectionHeader title={t('common.details')} />
      <Card>
        <KeyValue label={t('profile.class')} value={me.data?.className} />
        <KeyValue label={t('profile.bus')} value={me.data?.busName} />
        <KeyValue label={t('student.parentContact')} value={[me.data?.parentEmail, me.data?.parentPhone].filter(Boolean).join(' · ')} />
      </Card>

      <SectionHeader title={t('transport.savedPlaces')} action={t('transport.manage')} onAction={openPlaces} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {home ? (
          <View style={{ height: 150 }} pointerEvents="none">
            <MapView
              key={`${home.lat},${home.lng}`}
              markers={[{ id: 'home', kind: 'home', lat: home.lat, lng: home.lng, color: colors.primary }]}
              initialRegion={{ lat: home.lat, lng: home.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            />
          </View>
        ) : null}
        {list.slice(0, 4).map((p, i) => {
          const on = isActivePlace(p, me.data);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={openPlaces}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.surfaceAlt }}>
                <Ionicons name={PLACE_ICONS[placeKind(p.kind)]} size={17} color={on ? colors.onPrimary : colors.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.label?.trim() || t(`transport.kinds.${placeKind(p.kind)}`)}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {placeLine(p) || p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}
                </Text>
              </View>
              {on ? (
                <Text variant="label" color="primary">
                  {t('transport.active')}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {!list.length ? (
          <Text color="textMuted" style={{ padding: spacing.lg }}>
            {t('profile.homeLocationNotSet')}
          </Text>
        ) : null}
      </Card>

      <LanguageSection />
      <AppearanceSection />
      <NotificationSection showTestAlarm />
      <AccountSection />
    </Screen>
  );
}
