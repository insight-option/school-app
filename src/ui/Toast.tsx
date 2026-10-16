import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Text } from './Text';
import { useTheme } from './theme';

export type ToastTone = 'info' | 'success' | 'error' | 'warning';
type ToastItem = { id: number; message: string; tone: ToastTone; duration: number; action?: { label: string; onPress: () => void } };

type ToastState = { items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; dismiss: (id: number) => void };

let seq = 1;
export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: seq++ }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  show(message: string, tone: ToastTone = 'info', opts: { duration?: number; action?: ToastItem['action'] } = {}) {
    useToastStore.getState().push({ message, tone, duration: opts.duration ?? (tone === 'error' ? 5000 : 3000), action: opts.action });
  },
  success: (m: string) => toast.show(m, 'success'),
  error: (m: string) => toast.show(m, 'error'),
  info: (m: string) => toast.show(m, 'info'),
  warning: (m: string) => toast.show(m, 'warning'),
};

function ToastView({ item }: { item: ToastItem }) {
  const { colors, radius } = useTheme();
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item, dismiss]);
  const tone = {
    info: { bg: colors.text, fg: colors.background, icon: 'information-circle' as const },
    success: { bg: colors.success, fg: '#fff', icon: 'checkmark-circle' as const },
    error: { bg: colors.danger, fg: '#fff', icon: 'alert-circle' as const },
    warning: { bg: colors.warning, fg: '#fff', icon: 'warning' as const },
  }[item.tone];
  return (
    <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(160)} style={[styles.toast, { backgroundColor: tone.bg, borderRadius: radius.md }]}>
      <Ionicons name={tone.icon} size={20} color={tone.fg} />
      <Text style={{ color: tone.fg, flex: 1 }} numberOfLines={3}>
        {item.message}
      </Text>
      {item.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            item.action?.onPress();
            dismiss(item.id);
          }}
        >
          <Text style={{ color: tone.fg, fontWeight: '700' }}>{item.action.label}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => dismiss(item.id)} hitSlop={8}>
        <Ionicons name="close" size={18} color={tone.fg} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {items.map((i) => (
        <ToastView key={i.id} item={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 1000, gap: 8, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, width: '100%', maxWidth: 520 },
});
