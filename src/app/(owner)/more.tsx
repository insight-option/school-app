import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, ListItem, Screen, SectionHeader, Text, useTheme } from '../../ui';
import { useSession } from '../../lib/auth/session';
import { useBranding } from '../../features/branding';
import { AccountSection, AppearanceSection } from '../../components/profile/ProfileSections';
import { StorageImage } from '../../components/media/StorageImage';
import { IconTile, LanguagePicker } from '../../components/owner/kit';
import { OWNER_SECONDARY, OWNER_SECTIONS } from './_layout';

/** Console hub on phones (users, categories, branding, activity) + account settings. */
export default function OwnerMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const branding = useBranding();
  const sections = OWNER_SECTIONS.filter((s) => OWNER_SECONDARY.includes(s.name));
  const tint: Record<string, string> = { users: '#3E63DD', categories: '#12A150', branding: theme.colors.primary, activity: '#6E56CF' };

  return (
    <Screen title={t('owner.more.title')} scroll maxWidth={720}>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <Card elevation="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: branding.logoKey ? theme.colors.surfaceAlt : theme.colors.primary }}>
            {branding.logoKey ? <StorageImage storageKey={branding.logoKey} style={{ width: 52, height: 52 }} contentFit="contain" /> : <Ionicons name="sparkles" size={24} color={theme.colors.onPrimary} />}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="subheading" numberOfLines={1}>
              {session.name || session.email || session.username || branding.appName}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {t('owner.more.signedInAs', { name: session.email || session.username || '' })}
            </Text>
            <Badge label={t('owner.more.role')} tone="accent" size="sm" icon="shield-checkmark" />
          </View>
        </Card>

        <SectionHeader title={t('owner.more.sections')} />
        <Card padding={0}>
          {sections.map((s, i) => (
            <ListItem
              key={s.name}
              title={t(s.key)}
              left={<IconTile icon={s.active as never} color={tint[s.name] ?? theme.colors.primary} size={40} />}
              chevron
              onPress={() => router.push(`/(owner)/${s.name}` as never)}
              style={i === sections.length - 1 ? { borderBottomWidth: 0 } : undefined}
            />
          ))}
        </Card>

        <SectionHeader title={t('owner.more.language')} />
        <LanguagePicker />
        <AppearanceSection />
        <AccountSection />
      </View>
    </Screen>
  );
}
