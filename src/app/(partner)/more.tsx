import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Card, ListItem, Screen, SectionHeader, Text, useTheme } from '../../ui';
import { SchoolLogo } from '../../components/media/StorageImage';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection } from '../../components/profile/ProfileSections';
import { useMyBusiness } from '../../features/partner';
import { useSession } from '../../lib/auth/session';

/** Phone overflow + account: billing, business links, language, appearance, notifications, sign out. */
export default function PartnerMore() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const business = useMyBusiness();
  const name = business.data?.name ?? t('partner.brandFallback');
  return (
    <Screen title={t('partner.more.title')} scroll maxWidth={720}>
      <Card elevation="raised" style={styles.header}>
        <SchoolLogo logoKey={business.data?.logoKey} name={name} color={business.data?.primaryColor} size={64} radius={20} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {[session.name, session.email].filter(Boolean).join(' · ')}
          </Text>
          <Badge label={t('partner.role')} tone="primary" size="sm" style={{ marginTop: 4 }} />
        </View>
      </Card>

      <SectionHeader title={t('partner.more.workspace')} />
      <Card padding={0}>
        <ListItem icon="card-outline" title={t('partner.tabs.billing')} chevron onPress={() => router.push('/(partner)/billing' as never)} />
        <ListItem icon="storefront-outline" title={t('partner.business.title')} chevron onPress={() => router.push('/(partner)/business' as never)} />
        <ListItem icon="football-outline" title={t('partner.venues.title')} chevron onPress={() => router.push('/(partner)/venues' as never)} />
        {business.data ? (
          <ListItem icon="open-outline" title={t('partner.dashboard.viewPublic')} chevron onPress={() => router.push(`/businesses/${business.data!.businessId}` as never)} style={{ borderBottomWidth: 0 }} />
        ) : null}
      </Card>

      <LanguageSection />
      <AppearanceSection />
      <NotificationSection />
      <AccountSection />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
});
