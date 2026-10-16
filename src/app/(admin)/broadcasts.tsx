import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Screen, Select, Sheet, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { BroadcastList } from '../../components/BroadcastList';
import { useAllBroadcasts, useSendBroadcast } from '../../features/engagement';
import { useBuses, useClasses } from '../../features/school';
import { useMyProfile } from '../../features/profiles';
import { captureWithCamera, pickDocument, pickFromLibrary, uploadAttachment, type PickedAttachment } from '../../components/chat/attachments';
import type { BroadcastAudience } from '../../lib/data/client';
import { isWeb } from '../../lib/util/device';

const AUDIENCES: BroadcastAudience[] = ['ALL_STUDENTS', 'ALL_TEACHERS', 'ALL_DRIVERS', 'CLASS', 'BUS'];

export default function AdminBroadcasts() {
  const { t } = useTranslation();
  const theme = useTheme();
  const list = useAllBroadcasts(true);
  const send = useSendBroadcast();
  const classes = useClasses();
  const buses = useBuses();
  const me = useMyProfile();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<BroadcastAudience>('ALL_STUDENTS');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return toast.error(t('common.requiredField'));
    if ((audience === 'CLASS' || audience === 'BUS') && !targetId) return toast.error(t('common.requiredField'));
    setBusy(true);
    try {
      const keys: string[] = [];
      for (const a of attachments) keys.push((await uploadAttachment(a, 'broadcasts')).key);
      const targetName = audience === 'CLASS' ? classes.data?.find((c) => c.id === targetId)?.name : audience === 'BUS' ? buses.data?.find((b) => b.busId === targetId)?.plate : undefined;
      await send.mutateAsync({ audience, targetId: audience === 'CLASS' || audience === 'BUS' ? targetId : 'ALL', targetName, title: title.trim(), body: body.trim(), attachmentKeys: keys, authorName: me.data?.fullName });
      toast.success(t('admin.broadcastSent', { count: '…' }));
      setOpen(false);
      setTitle('');
      setBody('');
      setAttachments([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('admin.broadcasts')} scroll maxWidth={880} refreshing={list.isRefetching} onRefresh={() => list.refetch()} right={<Button size="sm" icon="megaphone" title={t('admin.newBroadcast')} onPress={() => setOpen(true)} />}>
      <View style={{ paddingTop: theme.spacing.md }}>
        <BroadcastList items={list.data} loading={list.isLoading} showAudience />
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('admin.newBroadcast')}>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="captionStrong" color="textMuted">
            {t('admin.audience')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AUDIENCES.map((a) => (
              <Chip key={a} label={t(`admin.audiences.${a}`)} selected={audience === a} onPress={() => { setAudience(a); setTargetId(null); }} />
            ))}
          </View>
          {audience === 'CLASS' ? <Select label={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={targetId} onChange={(v) => setTargetId((v as string) || null)} searchable required /> : null}
          {audience === 'BUS' ? <Select label={t('admin.bus')} options={(buses.data ?? []).map((b) => ({ value: b.busId, label: b.plate, subtitle: b.driverName }))} value={targetId} onChange={(v) => setTargetId((v as string) || null)} searchable required /> : null}
          <Input label={t('teacher.title')} value={title} onChangeText={setTitle} required maxLength={140} />
          <Input label={t('teacher.body')} value={body} onChangeText={setBody} required multiline style={{ minHeight: 120, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {!isWeb ? <Button size="sm" variant="outline" icon="camera-outline" title={t('common.camera')} onPress={() => captureWithCamera().then((a) => a && setAttachments((p) => [...p, ...a]))} /> : null}
            <Button size="sm" variant="outline" icon="images-outline" title={t('common.gallery')} onPress={() => pickFromLibrary('both').then((a) => a && setAttachments((p) => [...p, ...a]))} />
            <Button size="sm" variant="outline" icon="document-outline" title={t('common.document')} onPress={() => pickDocument().then((a) => a && setAttachments((p) => [...p, ...a]))} />
          </View>
          {attachments.map((a, i) => (
            <Text key={i} variant="caption" numberOfLines={1}>
              📎 {a.name}
            </Text>
          ))}
          <Text variant="caption" color="textMuted">
            {t('admin.everyoneReads')}
          </Text>
          <Button title={t('common.send')} icon="send" loading={busy} onPress={submit} />
        </View>
      </Sheet>
    </Screen>
  );
}
