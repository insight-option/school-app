import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, Stars, Text, useTheme, type BadgeTone } from '../ui';
import type { Feedback, FeedbackCategory } from '../lib/data/client';
import { useSignedUrl, signedUrl } from '../lib/storage/s3';
import { formatDateTime } from '../lib/util/format';
import { MediaViewer, type MediaItem } from './chat/MediaViewer';
import { openExternal } from '../lib/util/device';

const TONES: Record<FeedbackCategory, BadgeTone> = { ACADEMIC: 'primary', BEHAVIOR: 'warning', ATTENDANCE: 'info', PRAISE: 'success', OTHER: 'neutral' };

export function FeedbackCard({ item, showStudent, actions }: { item: Feedback; showStudent?: boolean; actions?: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [media, setMedia] = useState<MediaItem | null>(null);
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={t(`teacher.categories.${item.category}`)} tone={TONES[item.category]} />
        <Badge label={t(`teacher.audiences.${item.audience}`)} />
        <View style={{ flex: 1 }} />
        <Text variant="caption" color="textFaint">
          {formatDateTime(item.postedAt)}
        </Text>
      </View>
      {showStudent ? (
        <Text variant="captionStrong" color="textMuted">
          {t('feedback.forStudent', { name: item.studentName })}
          {item.className ? ` · ${item.className}` : ''}
        </Text>
      ) : null}
      <Text variant="subheading">{item.title}</Text>
      {item.rating ? <Stars value={item.rating} size={18} /> : null}
      <Text>{item.body}</Text>
      {item.attachmentKeys?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {item.attachmentKeys.filter((k): k is string => !!k).map((k) => (
            <AttachmentThumb key={k} storageKey={k} onOpen={setMedia} />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textMuted">
          {t('feedback.from', { name: item.authorName })} · {t(`roles.${item.authorRole}`)}
        </Text>
        {actions}
      </View>
      <MediaViewer item={media} onClose={() => setMedia(null)} />
    </Card>
  );
}

function AttachmentThumb({ storageKey, onOpen }: { storageKey: string; onOpen: (m: MediaItem) => void }) {
  const theme = useTheme();
  const url = useSignedUrl(storageKey);
  const ext = storageKey.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext);
  const isVideo = ['mp4', 'mov', 'm4v', 'webm'].includes(ext);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        const u = url ?? (await signedUrl(storageKey));
        if (isImage) onOpen({ kind: 'image', uri: u });
        else if (isVideo) onOpen({ kind: 'video', uri: u });
        else void openExternal(u);
      }}
      style={{ width: 72, height: 72, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
    >
      {isImage && url ? <Image source={{ uri: url }} style={{ width: 72, height: 72 }} contentFit="cover" cachePolicy="disk" /> : <Ionicons name={isVideo ? 'videocam' : 'document-text'} size={28} color={theme.colors.primary} />}
    </Pressable>
  );
}
