import React from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';

export type MediaItem = { kind: 'image' | 'video'; uri: string; title?: string };

export function MediaViewer({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={!!item} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {item?.kind === 'image' ? (
          <Image source={{ uri: item.uri }} style={{ width, height }} contentFit="contain" cachePolicy="disk" accessibilityLabel={item.title} />
        ) : item?.kind === 'video' ? (
          <FullVideo uri={item.uri} />
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {item?.title ? (
          <Text variant="caption" style={[styles.title, { bottom: insets.bottom + 16 }]} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

function FullVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  title: { position: 'absolute', left: 16, right: 16, color: '#fff', textAlign: 'center' },
});
