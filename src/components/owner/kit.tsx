import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as Updates from 'expo-updates';
import { Card, Chip, ConfirmSheet, SectionHeader, Text, useTheme, withAlpha } from '../../ui';
import { toast } from '../../ui/Toast';
import { StorageImage } from '../media/StorageImage';
import { colorFromString } from '../../ui/theme';
import { schoolInitials } from '../../lib/directory';
import { randomId, uploadFile } from '../../lib/storage/s3';
import { ImageManipulator, SaveFactor } from '../profile/imageHelpers';
import { setAppLanguage, type AppLanguage } from '../../lib/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

/** Soft tinted square holding an icon (KPI tiles, rows, alerts). */
export function IconTile({ icon, color, size = 40, radius }: { icon: IconName; color: string; size?: number; radius?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.32), backgroundColor: withAlpha(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Big-number KPI card. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  color,
  hintTone = 'textMuted',
  onPress,
  style,
}: {
  label: string;
  value: string;
  hint?: string | null;
  icon: IconName;
  color?: string;
  hintTone?: 'textMuted' | 'danger' | 'success' | 'warning';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const tint = color ?? theme.colors.primary;
  return (
    <Card onPress={onPress} style={[{ gap: 12, minHeight: 132 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconTile icon={icon} color={tint} size={38} />
        {onPress ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} /> : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </Text>
        <Text variant="captionStrong" color="textMuted" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={hintTone} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** Responsive grid: 2 columns on phones, more on wide screens. */
export function Grid({ children, columns, gap = 12 }: { children: React.ReactNode; columns: number; gap?: number }) {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((child, c) => (
            <View key={c} style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {row.length < columns ? Array.from({ length: columns - row.length }).map((_, i) => <View key={`pad${i}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

/** Simple vertical bar chart drawn with Views (no chart dependency). */
export function BarChart({ data, color, formatValue, height = 140 }: { data: { label: string; value: number }[]; color?: string; formatValue?: (v: number) => string; height?: number }) {
  const theme = useTheme();
  const tint = color ?? theme.colors.primary;
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data.length - 1;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: data.length > 10 ? 4 : 10 }}>
        {data.map((d, i) => {
          const h = Math.max(4, Math.round((d.value / max) * (height - 22)));
          return (
            <View key={`${d.label}${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              {d.value > 0 && (data.length <= 8 || i === last) ? (
                <Text variant="caption" color="textMuted" numberOfLines={1} style={{ fontSize: 10 }}>
                  {formatValue ? formatValue(d.value) : String(d.value)}
                </Text>
              ) : null}
              <View style={{ width: '100%', maxWidth: 34, height: h, borderRadius: 8, backgroundColor: i === last ? tint : withAlpha(tint, 0.28) }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: data.length > 10 ? 4 : 10 }}>
        {data.map((d, i) => (
          <Text key={`${d.label}${i}l`} variant="caption" color="textFaint" align="center" numberOfLines={1} style={{ flex: 1, fontSize: 10 }}>
            {data.length > 10 && i % 2 === 1 && i !== last ? '' : d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Pill segmented control (tabs inside a screen). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, { borderRadius: theme.radius.pill }, active ? [{ backgroundColor: theme.colors.surface }, theme.shadow.card] : null]}
          >
            <Text variant="captionStrong" weight={active ? '800' : '600'} color={active ? 'text' : 'textMuted'} numberOfLines={1}>
              {o.label}
              {o.count !== undefined ? ` · ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal chip filter row. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {children}
    </ScrollView>
  );
}

/** Logo of a school or business, or initials on its colour. */
export function TenantLogo({ logoKey, name, color, size = 44 }: { logoKey?: string | null; name: string; color?: string | null; size?: number }) {
  const theme = useTheme();
  const accent = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : colorFromString(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: logoKey ? theme.colors.surface : accent,
        borderWidth: logoKey ? 1 : 0,
        borderColor: theme.colors.border,
      }}
    >
      {logoKey ? (
        <StorageImage storageKey={logoKey} style={{ width: size - 4, height: size - 4 }} contentFit="contain" />
      ) : (
        <Text style={{ color: '#fff', fontSize: size * 0.36, lineHeight: size * 0.46 }} weight="800">
          {schoolInitials(name)}
        </Text>
      )}
    </View>
  );
}

/** A titled card section. */
export function Section({ title, action, onAction, children, padding }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; padding?: number }) {
  return (
    <View>
      <SectionHeader title={title} action={action} onAction={onAction} />
      <Card padding={padding}>{children}</Card>
    </View>
  );
}

/** Large page intro used at the top of console screens. */
export function PageIntro({ overline, title, subtitle, right }: { overline?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 8, paddingBottom: 4 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {overline ? (
          <Text variant="overline" color="primary">
            {overline}
          </Text>
        ) : null}
        <Text variant="display" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text color="textMuted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const COLOR_SWATCHES = ['#8A1538', '#6E0F2B', '#B0123F', '#C8A24A', '#0C8599', '#12A150', '#3E63DD', '#6E56CF', '#D6336C', '#E8590C', '#16131A', '#5E5862'];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string | null | undefined) => !!v && HEX.test(v);

/** Swatches + hex input. */
export function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="captionStrong" color="textMuted">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {COLOR_SWATCHES.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={c}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(c)}
              style={[styles.swatch, { backgroundColor: c, borderColor: active ? theme.colors.text : 'transparent' }]}
            >
              {active ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.hexRow, { borderColor: error ? theme.colors.danger : theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface }]}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: isHexColor(value) ? value : theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }} />
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.trim().startsWith('#') || !v ? v.trim() : `#${v.trim()}`)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#8A1538"
          placeholderTextColor={theme.colors.textFaint}
          style={{ flex: 1, color: theme.colors.text, fontFamily: theme.fonts.semibold, fontSize: 16, paddingVertical: 10 }}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Picks one image and uploads it under `branding/<kind>-<random>.<ext>` (OWNER may write branding/*).
 * Logos and icons stay PNG (transparency); photos are re-encoded as JPEG. Returns the key or null.
 */
export async function pickAndUploadBrandingImage(kind: 'logo' | 'icon' | 'hero'): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: kind !== 'hero',
    aspect: kind === 'hero' ? undefined : [1, 1],
    quality: 0.92,
  });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const png = kind !== 'hero';
  let uri = asset.uri;
  if (Platform.OS !== 'web') {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const ref = await ctx.resize({ width: kind === 'icon' ? 1024 : kind === 'logo' ? 512 : 1600 }).renderAsync();
    const out = await ref.saveAsync(png ? { format: SaveFactor.PNG } : { compress: 0.82, format: SaveFactor.JPEG });
    ref.release();
    uri = out.uri;
  }
  const webMime = asset.mimeType ?? (png ? 'image/png' : 'image/jpeg');
  const mime = Platform.OS === 'web' ? webMime : png ? 'image/png' : 'image/jpeg';
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const key = `branding/${kind}-${randomId()}.${ext}`;
  await uploadFile(key, Platform.OS === 'web' && asset.file ? asset.file : uri, mime);
  return key;
}

/** Language chips for accounts without a school profile (the owner). */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const [restart, setRestart] = useState(false);
  const current = (i18n.language === 'ar' ? 'ar' : 'en') as AppLanguage;
  const change = async (lang: AppLanguage) => {
    if (lang === current) return;
    if (await setAppLanguage(lang)) setRestart(true);
  };
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label={t('common.english')} selected={current === 'en'} onPress={() => void change('en')} />
        <Chip label={t('common.arabic')} selected={current === 'ar'} onPress={() => void change('ar')} />
      </View>
      <ConfirmSheet
        visible={restart}
        title={t('common.restartRequired')}
        confirmLabel={t('common.restartNow')}
        cancelLabel={t('common.later')}
        onCancel={() => setRestart(false)}
        onConfirm={async () => {
          setRestart(false);
          try {
            await Updates.reloadAsync();
          } catch {
            toast.info(t('common.restartRequired'));
          }
        }}
      />
    </>
  );
}

/** Parses a decimal typed by a person ("1,250.5" → 1250.5); null when empty, NaN when invalid. */
export function parseAmount(v: string): number | null {
  const s = v.replace(/[\s,]/g, '').replace('٫', '.');
  if (!s) return null;
  const n = Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
  return Number.isFinite(n) ? n : NaN;
}

export const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const SUB_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'primary' | 'accent'> = {
  TRIAL: 'accent',
  ACTIVE: 'success',
  PAST_DUE: 'danger',
  SUSPENDED: 'warning',
  CANCELLED: 'neutral',
};

export const INVOICE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'primary' | 'accent'> = {
  DRAFT: 'neutral',
  ISSUED: 'primary',
  PAID: 'success',
  OVERDUE: 'danger',
  VOID: 'neutral',
};

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 8, minHeight: 38 },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12 },
});
