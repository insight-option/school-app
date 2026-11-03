import React, { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type GradientStop = { color: string; opacity?: number };

/**
 * Linear gradient background drawn with react-native-svg (works on iOS, Android, web and Expo Go
 * without an extra native module). Children render on top.
 *
 * The SVG is drawn at the measured pixel size: percentage sizes inside absolutely positioned SVGs
 * are measured wrongly on Android (the gradient stopped short of the right edge). Until the first
 * layout the first stop colour fills the view, so there is no flash.
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
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const rad = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(rad) / 2;
  const y = Math.sin(rad) / 2;
  const list = stops.map((s) => (typeof s === 'string' ? { color: s, opacity: 1 } : { color: s.color, opacity: s.opacity ?? 1 }));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };
  const fallback = !size && list[0] && list[0].opacity >= 1 ? { backgroundColor: list[Math.floor(list.length / 2)].color } : null;
  return (
    <View style={[style, fallback]} pointerEvents={pointerEvents} onLayout={onLayout}>
      {size && size.w > 0 && size.h > 0 ? (
        <Svg style={[StyleSheet.absoluteFill, { width: size.w, height: size.h }]} width={size.w} height={size.h} pointerEvents="none">
          <Defs>
            <LinearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
              {list.map((s, i) => (
                <Stop key={i} offset={list.length === 1 ? 0 : i / (list.length - 1)} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
