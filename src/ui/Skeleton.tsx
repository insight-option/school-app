import React, { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from './theme';

export function Skeleton({ width = '100%', height = 16, radius, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const pulse = useSharedValue(0.6);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View accessibilityElementsHidden style={[{ width, height, borderRadius: radius ?? theme.radius.sm, backgroundColor: theme.colors.skeleton }, animated, style]} />;
}

/** A list of card-like skeleton rows (used while the first page loads without cache). */
export function SkeletonList({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {avatar ? <Skeleton width={44} height={44} radius={22} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const { spacing, colors, radius } = useTheme();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }}>
      <Skeleton width="50%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${90 - i * 15}%`} height={12} />
      ))}
    </View>
  );
}
