import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from '../../ui';

/** "Step 2 of 3" with progress pills (sign-up and school set-up). */
export function StepDots({ current, total, label }: { current: number; total: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ height: 6, flex: i + 1 === current ? 2 : 1, borderRadius: 3, backgroundColor: i + 1 <= current ? colors.primary : colors.border }} />
        ))}
      </View>
      {label ? (
        <Text variant="captionStrong" color="primary">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
