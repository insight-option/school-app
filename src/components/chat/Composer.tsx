import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Text } from '../../ui/Text';
import { Sheet } from '../../ui/Sheet';
import { ListItem } from '../../ui/ListItem';
import { useTheme } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { haptic } from '../../lib/util/device';
import { formatMillis } from '../../lib/util/format';
import { captureWithCamera, pickDocument, pickFromLibrary, tooLarge, type PickedAttachment } from './attachments';
import { MAX_ATTACHMENT_MB } from '../../lib/storage/s3';

export type ComposerProps = {
  onSendText: (text: string) => void;
  onSendAttachments: (items: PickedAttachment[]) => void;
  disabled?: boolean;
};

const CANCEL_DX = 80;

/** Text + attachments + hold-to-record voice notes. Shared by every workspace. */
export function Composer({ onSendText, onSendAttachments, disabled }: ComposerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const startX = useRef(0);
  const inputRef = useRef<TextInput>(null);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSendText(v);
    setText('');
  };

  const handlePicked = (items: PickedAttachment[] | null) => {
    setMenu(false);
    if (!items?.length) return;
    const ok = items.filter((i) => !tooLarge(i));
    if (ok.length < items.length) toast.error(t('chat.attachmentTooLarge', { mb: MAX_ATTACHMENT_MB }));
    if (ok.length) onSendAttachments(ok);
  };

  const beginRecording = async (e: GestureResponderEvent) => {
    if (disabled) return;
    startX.current = e.nativeEvent.pageX;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      toast.error(t('chat.micPermission'));
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setCancelling(false);
      haptic('medium');
    } catch (err) {
      console.warn('record start failed', err);
    }
  };

  const endRecording = async () => {
    if (!recording) return;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      const durationMs = recState.durationMillis;
      if (cancelling || !uri || durationMs < 600) {
        haptic('light');
        return;
      }
      haptic('success');
      onSendAttachments([{ type: 'VOICE', uri, mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a', name: `voice-${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`, durationMs }]);
    } catch (err) {
      console.warn('record stop failed', err);
    } finally {
      setCancelling(false);
    }
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!recording) return;
    const dx = e.nativeEvent.pageX - startX.current;
    setCancelling(Math.abs(dx) > CANCEL_DX);
  };

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
      {recording ? (
        <View style={[styles.recordingBar, { backgroundColor: cancelling ? colors.dangerSoft : colors.primarySoft, borderRadius: radius.pill }]}>
          <View style={[styles.dot, { backgroundColor: colors.danger }]} />
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {cancelling ? t('chat.slideToCancel') : t('chat.recording')}
          </Text>
          <Text variant="captionStrong" color="textMuted">
            {formatMillis(recState.durationMillis)}
          </Text>
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.attach')} onPress={() => setMenu(true)} disabled={disabled} style={styles.iconBtn}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </Pressable>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.typeMessage')}
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!disabled}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.xl }]}
            onSubmitEditing={Platform.OS === 'web' ? send : undefined}
            blurOnSubmit={Platform.OS === 'web'}
            accessibilityLabel={t('chat.typeMessage')}
          />
        </>
      )}
      {text.trim().length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.send')} onPress={send} disabled={disabled} style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="send" size={20} color={colors.onPrimary} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.holdToRecord')}
          onPressIn={beginRecording}
          onPressOut={endRecording}
          onTouchMove={onTouchMove}
          disabled={disabled}
          style={[styles.sendBtn, { backgroundColor: recording ? colors.danger : colors.primary, transform: [{ scale: recording ? 1.15 : 1 }] }]}
        >
          <Ionicons name="mic" size={22} color="#fff" />
        </Pressable>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={t('common.attach')} scroll={false}>
        {Platform.OS !== 'web' ? <ListItem icon="camera-outline" title={t('common.camera')} onPress={() => captureWithCamera().then(handlePicked)} /> : null}
        <ListItem icon="images-outline" title={t('common.gallery')} subtitle={`${t('common.photo')} / ${t('common.video')}`} onPress={() => pickFromLibrary('both').then(handlePicked)} />
        <ListItem icon="document-outline" title={t('common.document')} subtitle="PDF, DOCX, …" onPress={() => pickDocument().then(handlePicked)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 140, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 16, writingDirection: 'auto' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  recordingBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 44 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
