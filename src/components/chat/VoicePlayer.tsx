import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text } from '../../ui/Text';
import { formatMillis } from '../../lib/util/format';

/** Inline voice-note player with play/pause and a scrubbable progress bar. */
export function VoicePlayer({ uri, durationMs, tint, onSurface }: { uri: string | undefined; durationMs?: number; tint: string; onSurface: string }) {
  'use no memo';
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);

  const duration = (status.duration && status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000) || 1;
  const current = scrub !== null ? scrub * duration : status.currentTime;
  const fraction = Math.max(0, Math.min(1, current / duration));

  const toggle = () => {
    if (!uri) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || status.currentTime >= duration - 0.2) void player.seekTo(0);
      player.play();
    }
  };

  const seekTo = async (f: number) => {
    await player.seekTo(Math.max(0, Math.min(duration, f * duration)));
    setScrub(null);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      runOnJS(setScrub)(Math.max(0, Math.min(1, e.x / barWidth)));
    })
    .onUpdate((e) => {
      runOnJS(setScrub)(Math.max(0, Math.min(1, e.x / barWidth)));
    })
    .onFinalize((e) => {
      runOnJS(seekTo)(Math.max(0, Math.min(1, e.x / barWidth)));
    });

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause' : 'Play'} onPress={toggle} style={[styles.play, { backgroundColor: tint }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color="#fff" style={status.playing ? undefined : { marginStart: 2 }} />
      </Pressable>
      <View style={styles.body}>
        <GestureDetector gesture={pan}>
          <View style={styles.barHit} onLayout={(e: LayoutChangeEvent) => setBarWidth(Math.max(1, e.nativeEvent.layout.width))}>
            <View style={[styles.bar, { backgroundColor: `${onSurface}33` }]}>
              <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: tint }]} />
            </View>
            <View style={[styles.knob, { left: `${fraction * 100}%`, backgroundColor: tint }]} />
          </View>
        </GestureDetector>
        <Text variant="caption" style={{ color: onSurface, opacity: 0.8 }}>
          {formatMillis(current * 1000)} / {formatMillis(duration * 1000)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  barHit: { height: 28, justifyContent: 'center' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 7 },
});
