import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Chip, ConfirmSheet, Input, Select, Stars, Text, useTheme, type SelectOption } from '../ui';
import { toast } from '../ui/Toast';
import type { FeedbackAudience, FeedbackCategory } from '../lib/data/client';
import { useSubmitFeedback } from '../features/engagement';
import { captureWithCamera, pickDocument, pickFromLibrary, uploadAttachment, type PickedAttachment } from './chat/attachments';
import { isWeb } from '../lib/util/device';

const CATEGORIES: FeedbackCategory[] = ['ACADEMIC', 'BEHAVIOR', 'ATTENDANCE', 'PRAISE', 'OTHER'];
const AUDIENCES: FeedbackAudience[] = ['PARENT', 'OFFICE', 'BOTH'];

/** Shared by teachers and the office. Teachers get a confirmation because feedback is immutable for them. */
export function FeedbackForm({ studentOptions, initialStudentIds = [], confirmBeforeSend, onSubmitted }: { studentOptions: SelectOption[]; initialStudentIds?: string[]; confirmBeforeSend?: boolean; onSubmitted?: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const submit = useSubmitFeedback();
  const [studentIds, setStudentIds] = useState<string[]>(initialStudentIds);
  const [audience, setAudience] = useState<FeedbackAudience>('PARENT');
  const [category, setCategory] = useState<FeedbackCategory>('ACADEMIC');
  const [rating, setRating] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!studentIds.length) e.students = t('common.requiredField');
    if (!title.trim()) e.title = t('common.requiredField');
    if (!body.trim()) e.body = t('common.requiredField');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const doSend = async () => {
    setConfirm(false);
    setUploading(true);
    try {
      const keys: string[] = [];
      for (const a of attachments) {
        const { key } = await uploadAttachment(a, `feedback/${studentIds[0]}`);
        keys.push(key);
      }
      await submit.mutateAsync({ studentIds, audience, category, rating, title: title.trim(), body: body.trim(), attachmentKeys: keys });
      toast.success(t('teacher.sent'));
      onSubmitted?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onSend = () => {
    if (!validate()) return;
    if (confirmBeforeSend) setConfirm(true);
    else void doSend();
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Select label={t('teacher.pickStudents')} options={studentOptions} value={studentIds} onChange={(v) => setStudentIds((v as string[]) ?? [])} multiple searchable required error={errors.students} />
      <View style={{ gap: 6 }}>
        <Text variant="captionStrong" color="textMuted">
          {t('teacher.audience')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {AUDIENCES.map((a) => (
            <Chip key={a} label={t(`teacher.audiences.${a}`)} selected={audience === a} onPress={() => setAudience(a)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="captionStrong" color="textMuted">
          {t('teacher.category')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`teacher.categories.${c}`)} selected={category === c} onPress={() => setCategory(c)} tone={c === 'PRAISE' ? 'success' : c === 'BEHAVIOR' ? 'warning' : 'primary'} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="captionStrong" color="textMuted">
          {t('teacher.rating')}
        </Text>
        <Stars value={rating} onChange={setRating} size={30} />
      </View>
      <Input label={t('teacher.title')} value={title} onChangeText={setTitle} error={errors.title} required maxLength={140} />
      <Input label={t('teacher.body')} value={body} onChangeText={setBody} error={errors.body} required multiline numberOfLines={5} style={{ minHeight: 120, textAlignVertical: 'top' }} />
      <View style={{ gap: 8 }}>
        <Text variant="captionStrong" color="textMuted">
          {t('common.attachments')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {!isWeb ? <Button size="sm" variant="outline" icon="camera-outline" title={t('common.camera')} onPress={() => captureWithCamera().then((a) => a && setAttachments((p) => [...p, ...a]))} /> : null}
          <Button size="sm" variant="outline" icon="images-outline" title={t('common.gallery')} onPress={() => pickFromLibrary('both').then((a) => a && setAttachments((p) => [...p, ...a]))} />
          <Button size="sm" variant="outline" icon="document-outline" title={t('common.document')} onPress={() => pickDocument().then((a) => a && setAttachments((p) => [...p, ...a]))} />
        </View>
        {attachments.map((a, i) => (
          <View key={`${a.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </Text>
            <Button size="sm" variant="ghost" icon="close" title="" onPress={() => setAttachments((p) => p.filter((_, j) => j !== i))} />
          </View>
        ))}
      </View>
      <Button title={t('teacher.sendFeedback')} size="lg" icon="send" onPress={onSend} loading={uploading || submit.isPending} fullWidth />
      <ConfirmSheet
        visible={confirm}
        title={t('teacher.confirmSendTitle')}
        body={t('teacher.confirmSendBody', { count: studentIds.length })}
        confirmLabel={t('common.send')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void doSend()}
      />
    </View>
  );
}
