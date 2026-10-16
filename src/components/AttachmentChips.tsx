import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '../ui';
import { signedUrl } from '../lib/storage/s3';
import { openExternal } from '../lib/util/device';
import { MediaViewer, type MediaItem } from './chat/MediaViewer';

/** Compact chips for attachment keys (feedback, broadcasts). Opens images/videos inline, files externally. */
export function AttachmentChips({ keys }: { keys: string[] }) {
  const theme = useTheme();
  const [media, setMedia] = useState<MediaItem | null>(null);
  if (!keys.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {keys.map((k) => {
        const name = k.split('/').pop() ?? k;
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const isVideo = ['mp4', 'mov', 'm4v', 'webm'].includes(ext);
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            onPress={async () => {
              const u = await signedUrl(k);
              if (isImage) setMedia({ kind: 'image', uri: u, title: name });
              else if (isVideo) setMedia({ kind: 'video', uri: u, title: name });
              else void openExternal(u);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt }}
          >
            <Ionicons name={isImage ? 'image' : isVideo ? 'videocam' : 'document-text'} size={16} color={theme.colors.primary} />
            <Text variant="caption" numberOfLines={1} style={{ maxWidth: 160 }}>
              {name}
            </Text>
          </Pressable>
        );
      })}
      <MediaViewer item={media} onClose={() => setMedia(null)} />
    </View>
  );
}
