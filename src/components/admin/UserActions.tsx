import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, ConfirmSheet, Input, Sheet, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import type { Profile } from '../../lib/data/client';
import { useDeleteUser, useResetUserPassword, useSetUserEnabled } from '../../features/school';
import { generatePassword, passwordProblem } from '../../lib/validation';
import { copyText } from '../../lib/util/device';

/** Reset password / disable / delete – shared by student, teacher and bus detail screens. */
export function UserActions({ profile, afterDelete }: { profile: Profile; afterDelete?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const reset = useResetUserPassword();
  const setEnabled = useSetUserEnabled();
  const del = useDeleteUser();
  const [resetOpen, setResetOpen] = useState(false);
  const [pwd, setPwd] = useState(generatePassword());
  const [sendEmail, setSendEmail] = useState(true);
  const [permanent, setPermanent] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = profile.isActive !== false;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="subheading">{t('common.actions')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Button title={t('admin.resetPassword')} variant="outline" icon="key-outline" onPress={() => setResetOpen(true)} />
        <Button title={active ? t('admin.disable') : t('admin.enable')} variant={active ? 'outline' : 'success'} icon={active ? 'ban-outline' : 'checkmark-circle-outline'} onPress={() => (active ? setConfirmDisable(true) : setEnabled.mutate({ username: profile.username, enabled: true }, { onError: (e) => toast.error(e.message) }))} loading={setEnabled.isPending} />
        <Button title={t('common.delete')} variant="danger" icon="trash-outline" onPress={() => setConfirmDelete(true)} />
      </View>

      <Sheet visible={resetOpen} onClose={() => setResetOpen(false)} title={t('admin.resetPassword')}>
        <Text color="textMuted" style={{ marginBottom: theme.spacing.md }}>
          {t('admin.resetPasswordBody', { name: profile.fullName })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Input label={t('auth.newPassword')} value={pwd} onChangeText={setPwd} containerStyle={{ flex: 1 }} error={error} autoCapitalize="none" />
          <Button title={t('common.generate')} variant="outline" onPress={() => setPwd(generatePassword())} style={{ marginBottom: error ? 22 : 0 }} />
          <Button title="" icon="copy-outline" variant="ghost" onPress={() => copyText(pwd, t('common.copied'))} style={{ marginBottom: error ? 22 : 0 }} />
        </View>
        <SwitchRow label={t('admin.sendByEmail')} value={sendEmail} onValueChange={setSendEmail} description={profile.role === 'STUDENT' ? (profile.parentEmail ?? undefined) : (profile.email ?? undefined)} />
        <SwitchRow label={t('admin.permanentPassword')} value={permanent} onValueChange={setPermanent} />
        <Button
          title={t('admin.resetPassword')}
          loading={reset.isPending}
          style={{ marginTop: theme.spacing.md }}
          onPress={() => {
            const p = passwordProblem(pwd, t);
            if (p) return setError(p);
            setError(null);
            reset.mutate(
              { username: profile.username, newPassword: pwd, sendEmail, permanent },
              {
                onSuccess: (r) => {
                  toast.success(`${t('admin.passwordReset')}${r?.emailSent ? ' ✉️' : ''}`);
                  setResetOpen(false);
                },
                onError: (e) => toast.error(e.message),
              },
            );
          }}
        />
      </Sheet>

      <ConfirmSheet visible={confirmDisable} title={t('admin.disable')} body={t('admin.disableConfirm')} confirmLabel={t('admin.disable')} cancelLabel={t('common.cancel')} destructive loading={setEnabled.isPending} onCancel={() => setConfirmDisable(false)} onConfirm={() => setEnabled.mutate({ username: profile.username, enabled: false }, { onSuccess: () => setConfirmDisable(false), onError: (e) => toast.error(e.message) })} />
      <ConfirmSheet
        visible={confirmDelete}
        title={t('common.confirmDeleteTitle')}
        body={t('admin.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={del.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          del.mutate(profile.username, {
            onSuccess: () => {
              toast.success(t('admin.deleted'));
              setConfirmDelete(false);
              if (afterDelete) router.replace(afterDelete as never);
              else router.back();
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </Card>
  );
}
