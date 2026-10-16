import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, ConfirmSheet, Screen, Text, useTheme } from '../ui';
import { toast } from '../ui/Toast';
import { useRequestDataDeletion } from '../features/engagement';
import { useSession } from '../lib/auth/session';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const [confirm, setConfirm] = useState(false);
  const request = useRequestDataDeletion();

  return (
    <Screen scroll back title={t('profile.privacy')} maxWidth={720}>
      <Card style={{ marginTop: theme.spacing.lg }}>
        <Text>{t('profile.privacyText')}</Text>
      </Card>
      {session.role !== 'ADMIN' ? (
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
          <Text variant="subheading">{t('profile.deleteData')}</Text>
          <Text color="textMuted">{t('profile.deleteDataBody')}</Text>
          <Button title={t('profile.deleteData')} variant="danger" onPress={() => setConfirm(true)} />
        </View>
      ) : null}
      <ConfirmSheet
        visible={confirm}
        title={t('profile.deleteData')}
        body={t('profile.deleteDataBody')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={request.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          request.mutate(undefined, {
            onSuccess: () => {
              setConfirm(false);
              toast.success(t('profile.deleteDataSent'));
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </Screen>
  );
}
