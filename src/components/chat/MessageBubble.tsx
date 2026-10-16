import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { parseJson, type Message } from '../../lib/data/client';
import { useSignedUrl } from '../../lib/storage/s3';
import { bytes, formatTime } from '../../lib/util/format';
import { VoicePlayer } from './VoicePlayer';
import type { AttachmentMeta, PendingUpload } from './uploadStore';
import type { MediaItem } from './MediaViewer';

export type BubbleStatus = 'sending' | 'sent' | 'failed' | 'uploading';

export type BubbleProps = {
  message: Message;
  mine: boolean;
  showSender: boolean;
  status: BubbleStatus;
  upload?: PendingUpload;
  localUri?: string;
  onLongPress?: (m: Message) => void;
  onOpenMedia?: (item: MediaItem) => void;
  onOpenFile?: (url: string, meta: AttachmentMeta) => void;
  onRetry?: () => void;
};

export const MessageBubble = memo(function MessageBubble({ message: m, mine, showSender, status, upload, localUri, onLongPress, onOpenMedia, onOpenFile, onRetry }: BubbleProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius } = theme;
  const meta = parseJson<AttachmentMeta>(m.attachmentMeta) ?? upload?.meta ?? {};
  const url = useSignedUrl(m.attachmentKey);
  const thumbUrl = useSignedUrl(meta.thumbKey);
  const bg = mine ? colors.primary : colors.surface;
  const fg = mine ? colors.onPrimary : colors.text;
  const subtle = mine ? 'rgba(255,255,255,0.75)' : colors.textMuted;

  const body = () => {
    if (m.deleted) {
      return (
        <Text style={{ color: subtle, fontStyle: 'italic' }}>{t('chat.deleted')}</Text>
      );
    }
    switch (m.type) {
      case 'IMAGE': {
        const src = localUri ?? thumbUrl ?? url;
        const ratio = meta.width && meta.height ? meta.width / meta.height : 4 / 3;
        return (
          <Pressable
            accessibilityRole="imagebutton"
            disabled={!url && !localUri}
            onPress={() => onOpenMedia?.({ kind: 'image', uri: url ?? localUri ?? '', title: meta.name })}
            style={{ width: 240, aspectRatio: Math.max(0.5, Math.min(2, ratio)), borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}
          >
            {src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={120} /> : <ActivityIndicator style={StyleSheet.absoluteFill} />}
            {status === 'uploading' ? <UploadOverlay progress={upload?.progress ?? 0} label={t('chat.uploading', { percent: Math.round((upload?.progress ?? 0) * 100) })} /> : null}
          </Pressable>
        );
      }
      case 'VIDEO':
        return (
          <Pressable
            accessibilityRole="button"
            disabled={!url}
            onPress={() => url && onOpenMedia?.({ kind: 'video', uri: url, title: meta.name })}
            style={{ width: 240, aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}
          >
            {thumbUrl ? <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.playCircle}>
              <Ionicons name="play" size={28} color="#fff" style={{ marginStart: 3 }} />
            </View>
            {meta.durationMs ? (
              <Text variant="caption" style={styles.videoDuration}>
                {Math.round(meta.durationMs / 1000)}s
              </Text>
            ) : null}
            {status === 'uploading' ? <UploadOverlay progress={upload?.progress ?? 0} label={t('chat.uploading', { percent: Math.round((upload?.progress ?? 0) * 100) })} /> : null}
          </Pressable>
        );
      case 'VOICE':
        return status === 'uploading' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 200 }}>
            <ActivityIndicator color={fg} />
            <Text style={{ color: fg }}>{t('chat.uploading', { percent: Math.round((upload?.progress ?? 0) * 100) })}</Text>
          </View>
        ) : (
          <VoicePlayer uri={url ?? localUri} durationMs={meta.durationMs} tint={mine ? '#fff' : colors.primary} onSurface={fg} />
        );
      case 'FILE':
        return (
          <Pressable accessibilityRole="button" disabled={!url} onPress={() => url && onOpenFile?.(url, meta)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 }}>
            <View style={[styles.fileIcon, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.primarySoft }]}>
              <Ionicons name="document-text" size={22} color={mine ? '#fff' : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: fg }} variant="bodyStrong" numberOfLines={2}>
                {meta.name ?? t('chat.file')}
              </Text>
              <Text variant="caption" style={{ color: subtle }}>
                {status === 'uploading' ? t('chat.uploading', { percent: Math.round((upload?.progress ?? 0) * 100) }) : bytes(meta.size)}
              </Text>
            </View>
          </Pressable>
        );
      default:
        return <Text style={{ color: fg }}>{m.text}</Text>;
    }
  };

  return (
    <View style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        accessibilityRole="button"
        onLongPress={() => onLongPress?.(m)}
        delayLongPress={350}
        style={[
          styles.bubble,
          {
            backgroundColor: bg,
            borderRadius: radius.lg,
            borderBottomRightRadius: mine ? 6 : radius.lg,
            borderBottomLeftRadius: mine ? radius.lg : 6,
            borderWidth: mine ? 0 : 1,
            borderColor: colors.border,
            opacity: status === 'sending' || status === 'uploading' ? 0.85 : 1,
          },
        ]}
      >
        {showSender && !mine ? (
          <Text variant="captionStrong" style={{ color: colors.primary, marginBottom: 2 }}>
            {m.senderName}
          </Text>
        ) : null}
        {body()}
        <View style={styles.footer}>
          <Text variant="caption" style={{ color: subtle, fontSize: 11 }}>
            {formatTime(m.sentAt)}
          </Text>
          {mine ? (
            status === 'failed' ? (
              <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="alert-circle" size={14} color="#FCA5A5" />
                <Text variant="caption" style={{ color: '#FCA5A5', fontSize: 11 }}>
                  {t('chat.failed')}
                </Text>
              </Pressable>
            ) : (
              <Ionicons name={status === 'sent' ? 'checkmark-done' : 'time-outline'} size={14} color={subtle} />
            )
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

function UploadOverlay({ progress, label }: { progress: number; label: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
      <ActivityIndicator color="#fff" />
      <Text variant="caption" style={{ color: '#fff' }}>
        {label}
      </Text>
      <View style={{ width: '70%', height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: '#fff', borderRadius: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 3 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  playCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  videoDuration: { position: 'absolute', bottom: 6, right: 8, color: '#fff' },
  fileIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
