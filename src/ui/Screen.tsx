import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from './theme';

export type ScreenProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  maxWidth?: number;
};

/** Page container: safe area, optional header (title/back), scroll + pull-to-refresh, keyboard avoidance. */
export function Screen({ children, title, subtitle, back, right, scroll, padded = true, edges, refreshing, onRefresh, style, contentStyle, keyboard, maxWidth }: ScreenProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const header =
    title || back || right ? (
      <View style={[styles.header, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.text} style={{ transform: [{ scaleX: 1 }] }} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <Text variant="title" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const inner = (
    <View style={[{ flex: 1, width: '100%', maxWidth: maxWidth ?? undefined, alignSelf: 'center' }, padded && !scroll ? { paddingHorizontal: spacing.lg } : null, contentStyle]}>
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ flexGrow: 1, paddingBottom: spacing.xxxl }, padded ? { paddingHorizontal: spacing.lg, paddingTop: spacing.md } : null]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      <View style={[{ width: '100%', maxWidth: maxWidth ?? undefined, alignSelf: 'center' }, contentStyle]}>{children}</View>
    </ScrollView>
  ) : (
    inner
  );

  return (
    <SafeAreaView edges={edges ?? ['top', 'left', 'right']} style={[styles.fill, { backgroundColor: colors.background }, style]}>
      {header}
      {keyboard ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill} keyboardVerticalOffset={0}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginStart: -8 },
});
