import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Card, Gradient, ListItem, Screen, SectionHeader, Text, heroStops, useTheme } from '../../ui';
import { useSession } from '../../lib/auth/session';
import { useBranding } from '../../features/branding';
import { AccountSection, AppearanceSection } from '../../components/profile/ProfileSections';
import { IconTile, LanguagePicker } from '../../components/owner/kit';
import { OWNER_SECONDARY, OWNER_SECTIONS } from './_layout';

/** Console hub on phones (users, categories, branding, activity) + account settings. */
export default function OwnerMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const branding = useBranding();
  const { width } = useWindowDimensions();
  const wide = width >= 900; // same breakpoint as the sidebar in _layout
  const sections = OWNER_SECTIONS.filter((s) => OWNER_SECONDARY.includes(s.name));
  const tint: Record<string, string> = { users: '#3E63DD', categories: '#12A150', branding: theme.colors.primary, activity: '#6E56CF' };

  return (
    <Screen title={wide ? t('owner.more.account') : t('owner.more.title')} scroll maxWidth={720}>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <Gradient stops={heroStops(theme)} angle={135} style={[styles.hero, theme.shadow.raised]}>
          <View style={styles.orb} pointerEvents="none" />
          <View style={styles.avatarRing}>
            <Avatar name={session.name || session.username || session.email || '?'} size={56} />
          </View>
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <Text variant="heading" style={styles.onDark} numberOfLines={1}>
              {session.name || session.username || branding.appName}
            </Text>
            {session.email ? (
              <Text variant="caption" style={styles.onDarkMuted} numberOfLines={1}>
                {session.email}
              </Text>
            ) : null}
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
              <Text variant="caption" weight="700" style={styles.onDark}>
                {t('owner.more.role')}
              </Text>
            </View>
          </View>
        </Gradient>

        {wide ? null : <SectionHeader title={t('owner.more.sections')} />}
        {wide ? null : (
          <Card padding={0}>
            {sections.map((s, i) => (
              <ListItem
                key={s.name}
                title={t(s.key)}
                left={<IconTile icon={s.active as never} color={tint[s.name] ?? theme.colors.primary} size={40} />}
                chevron
                onPress={() => router.push(`/owner/${s.name}` as never)}
                style={i === sections.length - 1 ? { borderBottomWidth: 0 } : undefined}
              />
            ))}
          </Card>
        )}

        <SectionHeader title={t('owner.more.language')} />
        <LanguagePicker />
        <AppearanceSection />
        <AccountSection />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 28, overflow: 'hidden' },
  orb: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -90, end: -50, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatarRing: { padding: 3, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.22)' },
  onDark: { color: '#FFFFFF' },
  onDarkMuted: { color: 'rgba(255,255,255,0.8)' },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
