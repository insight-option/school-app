import React from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, ListItem, Screen, SectionHeader } from '../../../ui';
import { AccountSection, AppearanceSection, LanguageSection, NotificationSection, ProfileHeader } from '../../../components/profile/ProfileSections';
import { useBranding } from '../../../features/branding';
import { useMyProfile } from '../../../features/profiles';

export default function CustomerAccount() {
  const { t } = useTranslation();
  const me = useMyProfile();
  const branding = useBranding();
  const support = [
    branding.supportEmail ? { icon: 'mail-outline' as const, title: branding.supportEmail, url: `mailto:${branding.supportEmail}` } : null,
    branding.whatsapp ? { icon: 'logo-whatsapp' as const, title: t('platform.venue.whatsapp'), url: `https://wa.me/${branding.whatsapp.replace(/\D/g, '')}` } : null,
    branding.supportPhone ? { icon: 'call-outline' as const, title: branding.supportPhone, url: `tel:${branding.supportPhone}` } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <Screen title={t('platform.account.title')} scroll maxWidth={720}>
      <ProfileHeader subtitle={me.data?.email} />
      <LanguageSection />
      <AppearanceSection />
      <NotificationSection />
      {support.length ? (
        <>
          <SectionHeader title={t('platform.account.help')} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {support.map((s) => (
              <ListItem key={s.url} icon={s.icon} title={s.title} chevron onPress={() => void Linking.openURL(s.url)} />
            ))}
          </Card>
        </>
      ) : null}
      <AccountSection />
    </Screen>
  );
}
