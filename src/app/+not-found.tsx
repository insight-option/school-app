import React from 'react';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, Text } from '../ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState icon="help-circle-outline" title={t('common.notFound')} />
      <Link href="/" style={{ alignSelf: 'center' }}>
        <Text color="primary" variant="bodyStrong">
          {t('common.back')}
        </Text>
      </Link>
    </Screen>
  );
}
