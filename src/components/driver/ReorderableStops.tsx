/* eslint-disable react-hooks/immutability -- Reanimated shared values (`.value = …`) are mutated inside gesture worklets by design. */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, Text, useTheme } from '../../ui';
import type { TripStop } from '../../lib/data/client';
import { formatDistance, formatEta } from '../../lib/util/format';
import { STOP_TONES } from '../StopTimeline';

export const STOP_ROW_HEIGHT = 64;

export type ReorderableStopsProps = {
  stops: TripStop[]; // ordered, only the routed ones
  selectedId?: string | null;
  onSelect: (stop: TripStop) => void;
  onReorder: (orderedIds: string[]) => void;
  disabled?: boolean;
};

/** Ordered "Next stops" list; long-press and drag a row to reorder manually. */
export function ReorderableStops({ stops, selectedId, onSelect, onReorder, disabled }: ReorderableStopsProps) {
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const ids = useMemo(() => stops.map((s) => s.id), [stops]);

  const commit = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
      const next = [...ids];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    },
    [ids, onReorder],
  );

  return (
    <View style={{ height: STOP_ROW_HEIGHT * stops.length }}>
      {stops.map((s, i) => (
        <Row key={s.id} stop={s} index={i} count={stops.length} activeIndex={activeIndex} dragY={dragY} selected={s.id === selectedId} onSelect={onSelect} commit={commit} disabled={!!disabled} />
      ))}
    </View>
  );
}

function Row({
  stop,
  index,
  count,
  activeIndex,
  dragY,
  selected,
  onSelect,
  commit,
  disabled,
}: {
  stop: TripStop;
  index: number;
  count: number;
  activeIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  selected: boolean;
  onSelect: (s: TripStop) => void;
  commit: (from: number, to: number) => void;
  disabled: boolean;
}) {
  'use no memo'; // Reanimated shared values are mutated inside gesture worklets by design.
  const { t } = useTranslation();
  const theme = useTheme();

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(280)
    .onStart(() => {
      activeIndex.value = index;
      dragY.value = 0;
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      const target = Math.max(0, Math.min(count - 1, Math.round((index * STOP_ROW_HEIGHT + dragY.value) / STOP_ROW_HEIGHT)));
      runOnJS(commit)(index, target);
    })
    .onFinalize(() => {
      activeIndex.value = -1;
      dragY.value = withTiming(0, { duration: 120 });
    });

  const style = useAnimatedStyle(() => {
    const isActive = activeIndex.value === index;
    if (isActive) {
      return { top: index * STOP_ROW_HEIGHT + dragY.value, zIndex: 10, transform: [{ scale: 1.02 }], shadowOpacity: 0.2, elevation: 6 };
    }
    // shift rows the dragged one passes over
    let offset = 0;
    if (activeIndex.value >= 0) {
      const target = Math.round((activeIndex.value * STOP_ROW_HEIGHT + dragY.value) / STOP_ROW_HEIGHT);
      if (activeIndex.value < index && target >= index) offset = -STOP_ROW_HEIGHT;
      if (activeIndex.value > index && target <= index) offset = STOP_ROW_HEIGHT;
    }
    return { top: index * STOP_ROW_HEIGHT, transform: [{ translateY: withSpring(offset, { damping: 20, stiffness: 200 }) }], zIndex: 1, shadowOpacity: 0, elevation: 0 };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface, borderBottomColor: theme.colors.border }, style]}>
        <Pressable accessibilityRole="button" onPress={() => onSelect(stop)} style={styles.inner}>
          <View style={[styles.order, { backgroundColor: theme.colors.text }]}>
            <Text style={{ color: theme.colors.background, fontWeight: '800', fontSize: 13 }}>{stop.order < 900 ? stop.order : '·'}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {stop.studentName}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {formatDistance(stop.distanceMeters)} · {formatEta(stop.etaSeconds)}
              {stop.homeAddress ? ` · ${stop.homeAddress}` : ''}
            </Text>
          </View>
          <Badge label={t(`trips.stopStatuses.${stop.status}`)} tone={STOP_TONES[stop.status]} size="sm" />
          <Ionicons name="reorder-three" size={22} color={theme.colors.textFaint} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, height: STOP_ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  order: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
