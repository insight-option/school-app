import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { StorageImage } from '../media/StorageImage';
import { pickFromLibrary } from '../chat/attachments';
import { uploadPublicImagesSettled } from './fields';

export const MAX_PHOTOS = 12;

/** Venue photos: add (multi-pick), remove, make cover (= first). */
export function PhotoGrid({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const add = async () => {
    const picked = await pickFromLibrary('images');
    if (!picked?.length) return;
    const room = MAX_PHOTOS - value.length;
    const batch = picked.slice(0, room);
    setProgress({ done: 0, total: batch.length });
    try {
      const { keys, failed } = await uploadPublicImagesSettled(batch, (done) => setProgress({ done, total: batch.length }));
      if (keys.length) onChange([...value, ...keys].slice(0, MAX_PHOTOS));
      if (failed) toast.error(t('partner.venueForm.uploadFailed', { count: failed }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <View style={styles.grid}>
      {value.map((key, i) => (
        <View key={key} style={[styles.tile, { borderRadius: theme.radius.lg, backgroundColor: colors.surfaceAlt }]}>
          <StorageImage storageKey={key} style={StyleSheet.absoluteFill} contentFit="cover" />
          {i === 0 ? (
            <View style={[styles.coverBadge, { backgroundColor: colors.inverse }]}>
              <Text variant="label" style={{ color: colors.onInverse, fontSize: 10 }}>
                {t('partner.venueForm.cover')}
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('partner.venueForm.makeCover')}
              onPress={() => onChange([key, ...value.filter((k) => k !== key)])}
              style={[styles.corner, styles.cornerStart, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              hitSlop={6}
            >
              <Ionicons name="star-outline" size={14} color="#fff" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('partner.venueForm.removePhoto')}
            onPress={() => onChange(value.filter((k) => k !== key))}
            style={[styles.corner, styles.cornerEnd, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
            hitSlop={6}
          >
            <Ionicons name="close" size={15} color="#fff" />
          </Pressable>
        </View>
      ))}
      {value.length < MAX_PHOTOS ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('partner.venueForm.addPhotos')}
          onPress={add}
          disabled={!!progress}
          style={({ pressed }) => [styles.tile, styles.add, { borderRadius: theme.radius.lg, borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
        >
          <Ionicons name={progress ? 'cloud-upload-outline' : 'add'} size={26} color={colors.primary} />
          <Text variant="caption" color="textMuted" align="center" numberOfLines={2}>
            {progress ? t('partner.venueForm.uploading', progress) : t('partner.venueForm.addPhotos')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 104, height: 104, overflow: 'hidden' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  coverBadge: { position: 'absolute', bottom: 6, start: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  corner: { position: 'absolute', top: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cornerStart: { start: 6 },
  cornerEnd: { end: 6 },
});
