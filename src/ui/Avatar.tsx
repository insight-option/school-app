import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colorFromString, initials, useTheme } from './theme';
import { useSignedUrl } from '../lib/storage/s3';

export type AvatarProps = {
  name?: string | null;
  avatarKey?: string | null;
  uri?: string | null;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
};

export function Avatar({ name, avatarKey, uri, size = 44, icon, color }: AvatarProps) {
  const theme = useTheme();
  const signed = useSignedUrl(avatarKey ?? undefined);
  const src = uri ?? signed;
  const bg = color ?? colorFromString(name ?? avatarKey ?? '?');
  return (
    <View
      accessibilityLabel={name ?? undefined}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="disk" transition={150} />
      ) : icon ? (
        <Ionicons name={icon} size={size * 0.5} color="#fff" />
      ) : (
        <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '700', lineHeight: size * 0.46 }}>{initials(name)}</Text>
      )}
      {theme.scheme === 'dark' ? null : null}
    </View>
  );
}
