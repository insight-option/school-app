import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';

/** Pill-style segmented switch (2–5 options). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: colors.surfaceAlt }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.item, active ? [{ backgroundColor: colors.surface }, theme.shadow.card] : null]}
          >
            <Text variant="captionStrong" weight={active ? '800' : '600'} color={active ? 'text' : 'textMuted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: 16, gap: 4 },
  item: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
