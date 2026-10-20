import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Badge, Button, Card, Chip, ConfirmSheet, KeyValue, ListItem, SectionHeader, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { useSession, signOutEverywhere } from '../../lib/auth/session';
import { useMyProfile, useUpdateMyProfile } from '../../features/profiles';
import { useTestAlarm } from '../../features/trips';
import { setAppLanguage, type AppLanguage } from '../../lib/i18n';
import { useAppearanceStore, type AppearanceMode } from '../../lib/appearance';
import { getPushPermissionStatus, isPushSupported, openSystemNotificationSettings, registerDeviceForPush, requestPushPermission } from '../../lib/push/notifications';
import { uploadFile, randomId } from '../../lib/storage/s3';
import { ImageManipulator, SaveFactor } from './imageHelpers';
import { queryClient } from '../../lib/query/client';
import Constants from 'expo-constants';

/** Header card with avatar + name + role (used by all profile tabs). */
export function ProfileHeader({ subtitle }: { subtitle?: string | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const me = useMyProfile();
  const update = useUpdateMyProfile();
  const [busy, setBusy] = useState(false);

  const changeAvatar = async () => {
    if (!session.userId) return;
    const perm = Platform.OS === 'web' ? { granted: true } : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const asset = res.assets[0];
      let uri = asset.uri;
      if (Platform.OS !== 'web') {
        const ctx = ImageManipulator.manipulate(asset.uri);
        const ref = await ctx.resize({ width: 400 }).renderAsync();
        const out = await ref.saveAsync({ compress: 0.8, format: SaveFactor.JPEG });
        ref.release();
        uri = out.uri;
      }
      const key = `avatars/${session.userId}/${randomId()}.jpg`;
      await uploadFile(key, asset.file ?? uri, 'image/jpeg');
      await update.mutateAsync({ avatarKey: key });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ alignItems: 'center', gap: theme.spacing.sm }}>
      <Avatar name={me.data?.fullName ?? session.username} avatarKey={me.data?.avatarKey} size={88} />
      <Text variant="title" align="center">
        {me.data?.fullName ?? session.username ?? ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Badge label={t(`roles.${session.role ?? 'STUDENT'}`)} tone="primary" />
        {me.data?.username ? <Badge label={me.data.username} /> : null}
      </View>
      {subtitle ? <Text color="textMuted">{subtitle}</Text> : null}
      <Button title={t('profile.changeAvatar')} variant="ghost" size="sm" icon="camera-outline" onPress={changeAvatar} loading={busy} />
    </Card>
  );
}

export function LanguageSection() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const update = useUpdateMyProfile();
  const [restart, setRestart] = useState(false);
  const current = (i18n.language === 'ar' ? 'ar' : 'en') as AppLanguage;

  const change = async (lang: AppLanguage) => {
    if (lang === current) return;
    const needsRestart = await setAppLanguage(lang);
    update.mutate({ language: lang });
    if (needsRestart) setRestart(true);
  };

  return (
    <>
      <SectionHeader title={t('profile.language')} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip label={t('common.english')} selected={current === 'en'} onPress={() => change('en')} />
        <Chip label={t('common.arabic')} selected={current === 'ar'} onPress={() => change('ar')} />
      </View>
      <ConfirmSheet
        visible={restart}
        title={t('common.restartRequired')}
        confirmLabel={t('common.restartNow')}
        cancelLabel={t('common.later')}
        onCancel={() => setRestart(false)}
        onConfirm={async () => {
          setRestart(false);
          try {
            await Updates.reloadAsync();
          } catch {
            toast.info(t('common.restartRequired'));
          }
        }}
      />
    </>
  );
}

export function AppearanceSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const mode = useAppearanceStore((s) => s.mode);
  const setMode = useAppearanceStore((s) => s.setMode);
  const opts: AppearanceMode[] = ['system', 'light', 'dark'];
  return (
    <>
      <SectionHeader title={t('common.appearance')} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {opts.map((m) => (
          <Chip key={m} label={t(`common.${m}`)} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>
    </>
  );
}

export function NotificationSection({ showTestAlarm }: { showTestAlarm?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>('undetermined');
  const testAlarm = useTestAlarm();
  const router = useRouter();

  useEffect(() => {
    void getPushPermissionStatus().then(setStatus);
  }, []);

  const enable = async () => {
    const ok = await requestPushPermission();
    setStatus(ok ? 'granted' : 'denied');
    if (ok && session.userId) await registerDeviceForPush(session.userId);
  };

  if (!isPushSupported) return null;
  return (
    <>
      <SectionHeader title={t('profile.notifications')} />
      <Card style={{ gap: theme.spacing.md }}>
        <Text color={status === 'granted' ? 'success' : 'textMuted'}>{status === 'granted' ? t('notifications.permissionOk') : t('notifications.permissionBlocked')}</Text>
        {status !== 'granted' ? <Button title={status === 'denied' ? t('common.openSettings') : t('onboarding.allowNotifications')} variant="secondary" onPress={status === 'denied' ? openSystemNotificationSettings : enable} /> : null}
        {showTestAlarm ? (
          <Button
            title={t('student.testAlarm')}
            icon="alarm-outline"
            variant="outline"
            loading={testAlarm.isPending}
            onPress={() =>
              testAlarm.mutate(undefined, {
                onSuccess: (r) => {
                  if (r?.ok) toast.success(t('student.testAlarmSent'));
                  else toast.warning(t('student.testAlarmNoDevice'));
                  router.push('/alarm/test');
                },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        ) : null}
        <Text variant="caption" color="textMuted">
          {t('onboarding.batteryBody')}
        </Text>
      </Card>
    </>
  );
}

export function AccountSection({ extra }: { extra?: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      // The device stays registered on purpose: parents asked for bus alarms to keep ringing on this
      // phone even after signing out. Turning notifications off in the system settings stops them.
      await signOutEverywhere();
      queryClient.clear();
      router.replace('/(auth)/sign-in');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <SectionHeader title={t('profile.title')} />
      <Card padding={0}>
        <ListItem icon="key-outline" title={t('auth.changePassword')} onPress={() => router.push('/change-password')} chevron />
        <ListItem icon="notifications-outline" title={t('notifications.title')} onPress={() => router.push('/notifications')} chevron />
        <ListItem icon="shield-checkmark-outline" title={t('profile.privacy')} onPress={() => router.push('/privacy')} chevron />
        {extra}
        <ListItem icon="log-out-outline" title={t('auth.signOut')} onPress={() => setConfirm(true)} style={{ borderBottomWidth: 0 }} />
      </Card>
      <Text variant="caption" color="textFaint" align="center" style={{ marginTop: 16 }}>
        {t('common.version')} {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
      <ConfirmSheet visible={confirm} title={t('auth.signOut')} body={t('auth.signOutConfirm')} confirmLabel={t('auth.signOut')} cancelLabel={t('common.cancel')} destructive loading={busy} onCancel={() => setConfirm(false)} onConfirm={signOut} />
    </>
  );
}

export function ProfileFacts({ rows }: { rows: { label: string; value?: string | null }[] }) {
  return (
    <Card>
      {rows.map((r) => (
        <KeyValue key={r.label} label={r.label} value={r.value} />
      ))}
    </Card>
  );
}
