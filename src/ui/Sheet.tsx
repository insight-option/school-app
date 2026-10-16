import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Button } from './Button';
import { useTheme } from './theme';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  maxHeightFraction?: number;
  dismissable?: boolean;
};

/**
 * Bottom sheet on phones, centred dialog on wide screens. Built on RN Modal so it works on
 * Android, iOS and web without extra native dependencies.
 */
export function Sheet({ visible, onClose, title, children, footer, scroll = true, maxHeightFraction = 0.9, dismissable = true }: SheetProps) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 768;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: wide ? 0 : (1 - progress.value) * 40 }],
    opacity: progress.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={[styles.fill, { backgroundColor: colors.overlay, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }]}>
          <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
          <Animated.View
            style={[
              {
                backgroundColor: colors.surface,
                width: wide ? Math.min(560, width - 48) : '100%',
                maxHeight: height * maxHeightFraction,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                borderBottomLeftRadius: wide ? radius.xl : 0,
                borderBottomRightRadius: wide ? radius.xl : 0,
                paddingBottom: wide ? spacing.lg : Math.max(insets.bottom, spacing.lg),
              },
              theme.shadow.sheet,
              panelStyle,
            ]}
          >
            {!wide ? <View style={[styles.grabber, { backgroundColor: colors.border }]} /> : null}
            {title || dismissable ? (
              <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
                <Text variant="heading" style={styles.title} numberOfLines={2}>
                  {title ?? ''}
                </Text>
                {dismissable ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: spacing.lg, flexShrink: 1 }}>{children}</View>
            )}
            {footer ? <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 8, gap: 12 },
  title: { flex: 1 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

/** Simple confirm dialog built on Sheet. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} scroll={false} dismissable={!loading}>
      {body ? (
        <Text color="textMuted" style={{ marginBottom: spacing.lg }}>
          {body}
        </Text>
      ) : null}
      {children}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <Button title={cancelLabel} variant="outline" onPress={onCancel} disabled={loading} style={{ flex: 1 }} />
        <Button title={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}
