import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/** Pressable that springs down slightly while pressed (cards, tiles). Runs on the UI thread. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.975,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: React.ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        accessibilityRole="button"
        {...rest}
        onPressIn={(e) => {
          scale.set(withSpring(scaleTo, SPRING));
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.set(withSpring(1, SPRING));
          rest.onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
