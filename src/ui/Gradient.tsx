import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type GradientStop = { color: string; opacity?: number };

/**
 * Linear gradient background drawn with react-native-svg (works on iOS, Android, web and Expo Go
 * without an extra native module). Children render on top.
 */
export function Gradient({
  stops,
  angle = 135,
  style,
  children,
  pointerEvents,
}: {
  stops: (string | GradientStop)[];
  /** CSS-like angle in degrees: 90 = left→right, 180 = top→bottom, 135 = top-left→bottom-right. */
  angle?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const rad = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(rad) / 2;
  const y = Math.sin(rad) / 2;
  const list = stops.map((s) => (typeof s === 'string' ? { color: s, opacity: 1 } : { color: s.color, opacity: s.opacity ?? 1 }));
  return (
    <View style={style} pointerEvents={pointerEvents}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
            {list.map((s, i) => (
              <Stop key={i} offset={list.length === 1 ? 0 : i / (list.length - 1)} stopColor={s.color} stopOpacity={s.opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
