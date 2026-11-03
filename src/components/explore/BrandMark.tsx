import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from '../../ui';
import { StorageImage } from '../media/StorageImage';
import { useBranding } from '../../features/branding';

/** The app logo chosen in the owner console, or a monogram of the app name. */
export function BrandMark({ size = 40, onDark }: { size?: number; onDark?: boolean }) {
  const theme = useTheme();
  const branding = useBranding();
  const r = Math.round(size * 0.3);
  if (branding.logoKey) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
        <StorageImage storageKey={branding.logoKey} style={{ width: size, height: size }} contentFit="contain" />
      </View>
    );
  }
  // "OneQ" → "OQ", "Doha Hub" → "DH", "Salam" → "S"
  const caps = branding.appName.match(/\p{Lu}/gu) ?? [];
  const words = branding.appName.split(/\s+/).filter(Boolean);
  const letters = caps.length >= 2 ? caps[0] + caps[caps.length - 1] : words.length >= 2 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (branding.appName[0] ?? 'Q').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onDark ? 'rgba(255,255,255,0.95)' : theme.colors.primary,
      }}
    >
      <Text weight="800" style={{ color: onDark ? theme.colors.primary : theme.colors.onPrimary, fontSize: size * 0.4, lineHeight: size * 0.5, letterSpacing: -0.5 }}>
        {letters}
      </Text>
    </View>
  );
}
