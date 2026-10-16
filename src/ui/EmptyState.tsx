import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { useTheme } from './theme';

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  body,
  actionLabel,
  onAction,
  compact,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: compact ? spacing.lg : spacing.xxxl, gap: spacing.md }}>
      <View style={{ width: compact ? 56 : 80, height: compact ? 56 : 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={compact ? 28 : 40} color={colors.primary} />
      </View>
      <Text variant={compact ? 'subheading' : 'heading'} align="center">
        {title}
      </Text>
      {body ? (
        <Text color="textMuted" align="center" style={{ maxWidth: 360 }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: spacing.xxl, gap: spacing.md }}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
      <Text color="textMuted" align="center">
        {message}
      </Text>
      {onRetry ? <Button title={retryLabel} variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}
