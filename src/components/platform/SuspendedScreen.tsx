import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useTheme } from '../../ui';
import { publicClient, type Role } from '../../lib/data/client';
import { isSchoolRole } from '../../lib/auth/routing';
import { signOutEverywhere } from '../../lib/auth/session';
import { useBranding } from '../../features/branding';

/** Status of the caller's school (school roles) or business (partners); null when not applicable. */
export function useTenantStatus(role: Role | null | undefined, tenantId: string | null | undefined): string | null {
  const kind = isSchoolRole(role) ? 'SCHOOL' : role === 'PARTNER' ? 'BUSINESS' : null;
  const q = useQuery({
    queryKey: ['tenantStatus', kind, tenantId],
    enabled: !!kind && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (kind === 'SCHOOL') return (await publicClient.models.School.get({ schoolId: tenantId! })).data?.status ?? 'ACTIVE';
      return (await publicClient.models.Business.get({ businessId: tenantId! })).data?.status ?? 'ACTIVE';
    },
  });
  return q.data ?? null;
}

export function SuspendedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const branding = useBranding();
  const contact = branding.supportEmail ? `mailto:${branding.supportEmail}` : branding.whatsapp ? `https://wa.me/${branding.whatsapp.replace(/\D/g, '')}` : null;
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.icon, { backgroundColor: theme.colors.warningSoft }]}>
        <Ionicons name="pause-circle" size={44} color={theme.colors.warning} />
      </View>
      <Text variant="title" align="center">
        {t('platform.suspended.title')}
      </Text>
      <Text color="textMuted" align="center" style={{ maxWidth: 420 }}>
        {t('platform.suspended.body')}
      </Text>
      <View style={{ gap: 10, alignSelf: 'stretch', maxWidth: 420, width: '100%', marginTop: 12 }}>
        {contact ? <Button title={t('platform.suspended.contact')} icon="chatbubbles" onPress={() => void Linking.openURL(contact)} fullWidth /> : null}
        <Button title={t('platform.account.signOut')} variant="outline" icon="log-out-outline" onPress={() => void signOutEverywhere()} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  icon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
