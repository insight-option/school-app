import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Sheet, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { StorageImage } from '../media/StorageImage';
import { HomeLocationPicker } from '../map/HomeLocationPicker';
import { MapView } from '../map/MapView';
import { pickFromLibrary, uploadAttachment, type PickedAttachment } from '../chat/attachments';
import { myIdentityId } from '../../lib/storage/s3';
import type { LatLng } from '../../lib/geo';

type IconName = keyof typeof Ionicons.glyphMap;

/** Doha – the map centre when nothing better is known. */
export const DOHA: LatLng = { lat: 25.2854, lng: 51.531 };

/**
 * Upload picked images to the caller's public media folder (`school-media/<identity id>/…`), three
 * at a time. Returns the keys that uploaded (in pick order) and how many failed.
 */
export async function uploadPublicImages(picked: PickedAttachment[], onEach?: (done: number) => void): Promise<string[]> {
  const { keys, failed } = await uploadPublicImagesSettled(picked, onEach);
  if (failed && !keys.length) throw new Error('Upload failed – check your connection and try again.');
  return keys;
}

export async function uploadPublicImagesSettled(picked: PickedAttachment[], onEach?: (done: number) => void): Promise<{ keys: string[]; failed: number }> {
  const base = `school-media/${await myIdentityId()}`;
  const out: (string | null)[] = new Array(picked.length).fill(null);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < picked.length) {
      const i = next++;
      try {
        out[i] = (await uploadAttachment(picked[i], base)).key;
      } catch (e) {
        console.warn('image upload failed', e);
      }
      onEach?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, picked.length) }, worker));
  const keys = out.filter((k): k is string => !!k);
  return { keys, failed: picked.length - keys.length };
}

/** Card with a section title (and optional subtitle / right action). */
export function FormSection({ title, subtitle, icon, right, children, style }: { title: string; subtitle?: string; icon?: IconName; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <Card style={[{ gap: theme.spacing.md }, style]}>
      <View style={styles.sectionHead}>
        {icon ? (
          <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Ionicons name={icon} size={18} color={theme.colors.primary} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** Small uppercase label above a control. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="captionStrong" color="textMuted">
      {children}
    </Text>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; icon?: IconName };

/** Pill segmented control; wraps to several lines when the options do not fit. */
export function Segmented<T extends string>({ options, value, onChange, wrap = true }: { options: SegmentOption<T>[]; value: T | null | undefined; onChange: (v: T) => void; wrap?: boolean }) {
  const theme = useTheme();
  const { colors } = theme;
  const content = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(o.value)}
        style={({ pressed }) => [
          styles.segment,
          { borderRadius: theme.radius.pill, backgroundColor: active ? colors.inverse : pressed ? colors.surfaceAlt : colors.surface, borderColor: active ? colors.inverse : colors.border },
        ]}
      >
        {o.icon ? <Ionicons name={o.icon} size={15} color={active ? colors.onInverse : colors.textMuted} /> : null}
        <Text variant="captionStrong" style={{ color: active ? colors.onInverse : colors.text }} numberOfLines={1}>
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (!wrap) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {content}
      </ScrollView>
    );
  }
  return <View style={styles.segmentWrap}>{content}</View>;
}

/** − value + stepper for small integers. */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, format, allowEmpty }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; format?: (v: number) => string; allowEmpty?: boolean }) {
  const theme = useTheme();
  const { colors } = theme;
  const dec = () => {
    if (value === null) return;
    const next = value - step;
    if (next < min) onChange(allowEmpty ? null : min);
    else onChange(next);
  };
  const inc = () => onChange(value === null ? min : Math.min(max, value + step));
  return (
    <View style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: theme.radius.lg }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="−" onPress={dec} disabled={value === null || (!allowEmpty && value <= min)} hitSlop={6} style={({ pressed }) => [styles.stepBtn, { opacity: value === null || (!allowEmpty && value <= min) ? 0.35 : pressed ? 0.6 : 1 }]}>
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <Text variant="bodyStrong" style={{ minWidth: 72, textAlign: 'center' }}>
        {value === null ? '—' : format ? format(value) : String(value)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="+" onPress={inc} disabled={value !== null && value >= max} hitSlop={6} style={({ pressed }) => [styles.stepBtn, { opacity: value !== null && value >= max ? 0.35 : pressed ? 0.6 : 1 }]}>
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

/** HH:mm field with 15-minute steps (opens a sheet with hour + minute pickers). */
export function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const theme = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hh, mm] = (value || '08:00').split(':');
  const [draftH, setDraftH] = useState(hh);
  const [draftM, setDraftM] = useState(MINUTES.includes(mm) ? mm : '00');
  const show = () => {
    setDraftH(hh);
    setDraftM(MINUTES.includes(mm) ? mm : '00');
    setOpen(true);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label} ${value}` : value}
        onPress={show}
        style={({ pressed }) => [styles.timeField, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderRadius: theme.radius.md }]}
      >
        <Ionicons name="time-outline" size={16} color={colors.textMuted} />
        <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        scroll={false}
        footer={
          <Button
            title={t('common.done')}
            onPress={() => {
              onChange(`${draftH}:${draftM}`);
              setOpen(false);
            }}
            fullWidth
          />
        }
      >
        <Text variant="numeric" align="center" style={{ marginBottom: 12, fontVariant: ['tabular-nums'] }}>
          {draftH}:{draftM}
        </Text>
        <View style={styles.hourGrid}>
          {HOURS.map((h) => {
            const active = h === draftH;
            return (
              <Pressable
                key={h}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setDraftH(h)}
                style={[styles.hourCell, { borderRadius: theme.radius.md, backgroundColor: active ? colors.primary : colors.surfaceAlt }]}
              >
                <Text variant="captionStrong" style={{ color: active ? colors.onPrimary : colors.text }}>
                  {h}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.segmentWrap, { marginTop: 12, justifyContent: 'center' }]}>
          {MINUTES.map((m) => {
            const active = m === draftM;
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setDraftM(m)}
                style={[styles.minuteCell, { borderRadius: theme.radius.pill, backgroundColor: active ? colors.inverse : colors.surfaceAlt }]}
              >
                <Text variant="bodyStrong" style={{ color: active ? colors.onInverse : colors.text }}>
                  :{m}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

/** Single public image (logo / cover) with upload + change + optional remove. */
export function ImageField({
  value,
  onChange,
  shape = 'square',
  uploadLabel,
  changeLabel,
  removeLabel,
  placeholderIcon = 'image-outline',
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  shape?: 'square' | 'wide';
  uploadLabel: string;
  changeLabel: string;
  removeLabel?: string;
  placeholderIcon?: IconName;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const picked = await pickFromLibrary('images');
    if (!picked?.[0]) return;
    setBusy(true);
    try {
      const [key] = await uploadPublicImages([picked[0]]);
      onChange(key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const box = shape === 'wide' ? { width: '100%' as const, aspectRatio: 16 / 7 } : { width: 84, height: 84 };
  return (
    <View style={shape === 'wide' ? { gap: 10 } : styles.imageRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={value ? changeLabel : uploadLabel} onPress={pick} disabled={busy} style={[box, styles.imageBox, { backgroundColor: colors.surfaceAlt, borderRadius: shape === 'wide' ? theme.radius.lg : theme.radius.xl, borderColor: colors.border }]}>
        {value ? <StorageImage storageKey={value} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={placeholderIcon} size={28} color={colors.textFaint} />}
      </Pressable>
      <View style={shape === 'wide' ? styles.imageActionsRow : { flex: 1, gap: 8 }}>
        <Button title={value ? changeLabel : uploadLabel} icon="cloud-upload-outline" variant="outline" size="sm" loading={busy} onPress={pick} />
        {value && removeLabel ? <Button title={removeLabel} icon="trash-outline" variant="ghost" size="sm" onPress={() => onChange(null)} /> : null}
      </View>
    </View>
  );
}

/** Map preview + "set on map" sheet built on the shared HomeLocationPicker. */
export function LocationField({
  value,
  address,
  fallback,
  onChange,
  setLabel,
  changeLabel,
  emptyLabel,
}: {
  value: LatLng | null;
  address?: string | null;
  fallback?: LatLng | null;
  onChange: (v: { lat: number; lng: number; address?: string }) => void;
  setLabel: string;
  changeLabel: string;
  emptyLabel: string;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const shown = value ?? fallback ?? null;
  return (
    <View style={{ gap: 10 }}>
      {shown ? (
        <View style={[styles.mapBox, { borderRadius: theme.radius.lg }]} pointerEvents="none">
          <MapView
            key={`${shown.lat.toFixed(5)},${shown.lng.toFixed(5)}`}
            markers={[{ id: 'place', kind: 'pin', lat: shown.lat, lng: shown.lng }]}
            initialRegion={{ ...shown, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
          />
        </View>
      ) : (
        <View style={[styles.mapBox, styles.mapEmpty, { backgroundColor: colors.surfaceAlt, borderRadius: theme.radius.lg }]}>
          <Ionicons name="map-outline" size={34} color={colors.textFaint} />
          <Text variant="caption" color="textMuted">
            {emptyLabel}
          </Text>
        </View>
      )}
      {!value && fallback ? (
        <Text variant="caption" color="textMuted">
          {emptyLabel}
        </Text>
      ) : null}
      <Button title={value ? changeLabel : setLabel} icon="location-outline" variant="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={setLabel} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker
            initial={value}
            initialAddress={address ?? ''}
            fallbackCenter={value ?? fallback ?? DOHA}
            confirmLabel={t('common.save')}
            onConfirm={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

/** KPI tile for dashboards. */
export function StatTile({ label, value, icon, tone = 'primary', hint, onPress }: { label: string; value: string; icon: IconName; tone?: 'primary' | 'success' | 'warning' | 'accent' | 'neutral'; hint?: string; onPress?: () => void }) {
  const theme = useTheme();
  const { colors } = theme;
  const toneColor = { primary: colors.primary, success: colors.success, warning: colors.warning, accent: colors.accent, neutral: colors.textMuted }[tone];
  const soft = { primary: colors.primarySoft, success: colors.successSoft, warning: colors.warningSoft, accent: colors.accentSoft, neutral: colors.surfaceAlt }[tone];
  return (
    <Card onPress={onPress} style={styles.stat} padding={theme.spacing.lg}>
      <View style={[styles.statIcon, { backgroundColor: soft, borderRadius: theme.radius.md }]}>
        <Ionicons name={icon} size={18} color={toneColor} />
      </View>
      <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <Text variant="captionStrong" color="textMuted" numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" color="textFaint" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

/** Single choice as stacked cards (icon, label, optional description, check mark). */
export function RadioCards<T extends string>({ options, value, onChange }: { options: { value: T; label: string; description?: string; icon?: IconName }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.radio,
              { borderRadius: theme.radius.lg, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface },
            ]}
          >
            {o.icon ? <Ionicons name={o.icon} size={20} color={active ? colors.primary : colors.textMuted} /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" style={{ color: active ? colors.primary : colors.text }}>
                {o.label}
              </Text>
              {o.description ? (
                <Text variant="caption" color="textMuted">
                  {o.description}
                </Text>
              ) : null}
            </View>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.primary : colors.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Multi-select chips (categories, amenities). */
export function ChipSelect({ options, value, onChange }: { options: { value: string; label: string; icon?: IconName }[]; value: string[]; onChange: (v: string[]) => void }) {
  const theme = useTheme();
  const { colors } = theme;
  const set = useMemo(() => new Set(value), [value]);
  return (
    <View style={styles.segmentWrap}>
      {options.map((o) => {
        const active = set.has(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(active ? value.filter((v) => v !== o.value) : [...value, o.value])}
            style={({ pressed }) => [
              styles.segment,
              { borderRadius: theme.radius.pill, backgroundColor: active ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface, borderColor: active ? colors.primary : colors.border },
            ]}
          >
            <Ionicons name={active ? 'checkmark-circle' : (o.icon ?? 'ellipse-outline')} size={16} color={active ? colors.primary : colors.textMuted} />
            <Text variant="captionStrong" style={{ color: active ? colors.primary : colors.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 38, borderWidth: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, minHeight: 48, paddingHorizontal: 4, alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timeField: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, minHeight: 44 },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  hourCell: { width: 52, height: 42, alignItems: 'center', justifyContent: 'center' },
  minuteCell: { paddingHorizontal: 18, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  imageBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  imageActionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mapBox: { height: 180, overflow: 'hidden' },
  mapEmpty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  stat: { flexGrow: 1, flexBasis: 150, gap: 6 },
  statIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
