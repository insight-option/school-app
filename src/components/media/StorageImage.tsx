import React from 'react';
import { View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { useSignedUrl } from '../../lib/storage/s3';
import { Text } from '../../ui/Text';
import { colorFromString } from '../../ui/theme';
import { schoolInitials } from '../../lib/directory';

/**
 * Image stored in S3. Signed URLs rotate, so the disk/memory cache is keyed by the storage key
 * (`cacheKey`) – a logo downloaded once stays instant for every later screen and launch.
 */
export function StorageImage({
  storageKey,
  style,
  contentFit = 'cover',
  transition = 180,
}: {
  storageKey: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}) {
  const url = useSignedUrl(storageKey);
  if (!storageKey) return null;
  return (
    <Image
      source={url ? { uri: url, cacheKey: storageKey } : undefined}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      recyclingKey={storageKey}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Rounded school logo; falls back to initials on the school's accent colour. */
export function SchoolLogo({
  logoKey,
  name,
  color,
  size = 56,
  radius,
  bordered,
  style,
}: {
  logoKey?: string | null;
  name: string;
  color?: string | null;
  size?: number;
  radius?: number;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const r = radius ?? Math.round(size * 0.28);
  const accent = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : colorFromString(name);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: logoKey ? '#FFFFFF' : accent,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: bordered ? 3 : 0,
          borderColor: '#FFFFFF',
        },
        style,
      ]}
    >
      {logoKey ? (
        <StorageImage storageKey={logoKey} style={{ width: size - (bordered ? 6 : 0), height: size - (bordered ? 6 : 0) }} contentFit="contain" />
      ) : (
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: size * 0.36, lineHeight: size * 0.44 }}>{schoolInitials(name)}</Text>
      )}
    </View>
  );
}
