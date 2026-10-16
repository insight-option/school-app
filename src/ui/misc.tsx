import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useTheme } from './theme';

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, width: '100%' }, style]} />;
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'primary',
  icon,
  count,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
}) {
  const { colors, radius } = useTheme();
  const toneColor = { primary: colors.primary, success: colors.success, danger: colors.danger, warning: colors.warning, neutral: colors.textMuted }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderRadius: radius.pill, borderColor: selected ? toneColor : colors.border, backgroundColor: selected ? toneColor : pressed ? colors.surfaceAlt : colors.surface },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? '#fff' : toneColor} /> : null}
      <Text variant="captionStrong" style={{ color: selected ? '#fff' : colors.text }}>
        {label}
        {count !== undefined ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  color,
  background,
  disabled,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string;
  size?: number;
  color?: string;
  background?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: background ?? 'transparent', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color ?? colors.text} />
    </Pressable>
  );
}

export function SwitchRow({ label, description, value, onValueChange, disabled }: { label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

export function Stars({ value, onChange, size = 24 }: { value: number | null | undefined; onChange?: (v: number | null) => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} stars`} disabled={!onChange} onPress={() => onChange?.(value === n ? null : n)} hitSlop={4}>
          <Ionicons name={value && value >= n ? 'star' : 'star-outline'} size={size} color={value && value >= n ? '#F59E0B' : colors.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors, radius } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? colors.primary }} />
    </View>
  );
}

export type SelectOption<T extends string = string> = { value: T; label: string; subtitle?: string; disabled?: boolean };

/** Field that opens a searchable sheet of options (single or multi select). */
export function Select<T extends string = string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  multiple,
  searchable,
  error,
  disabled,
  required,
  renderOption,
  footer,
}: {
  label?: string;
  placeholder?: string;
  options: SelectOption<T>[];
  value: T | T[] | null | undefined;
  onChange: (v: T | T[] | null) => void;
  multiple?: boolean;
  searchable?: boolean;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  renderOption?: (o: SelectOption<T>, selected: boolean) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedValues = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.subtitle?.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const display = selectedValues.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ');

  const toggle = (v: T) => {
    if (multiple) {
      const next = selectedValues.includes(v) ? selectedValues.filter((x) => x !== v) : [...selectedValues, v];
      onChange(next);
    } else {
      onChange(v);
      setOpen(false);
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="captionStrong" color="textMuted">
          {label}
          {required ? <Text color="danger"> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectField,
          { borderRadius: radius.md, borderColor: error ? colors.danger : colors.border, backgroundColor: disabled ? colors.surfaceAlt : pressed ? colors.surfaceAlt : colors.surface },
        ]}
      >
        <Text numberOfLines={1} color={display ? 'text' : 'textFaint'} style={{ flex: 1 }}>
          {display || placeholder || t('common.select')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder} scroll footer={footer ?? (multiple ? <Button title={t('common.done')} onPress={() => setOpen(false)} fullWidth /> : undefined)}>
        {searchable ? (
          <View style={[styles.searchBox, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t('common.search')} placeholderTextColor={colors.textFaint} style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 8 }} autoFocus={false} />
          </View>
        ) : null}
        {!multiple && !required ? (
          <Pressable onPress={() => toggle(null as unknown as T)} style={styles.option}>
            <Text color="textMuted">{t('common.none')}</Text>
          </Pressable>
        ) : null}
        {filtered.length === 0 ? (
          <Text color="textMuted" style={{ paddingVertical: spacing.lg }} align="center">
            {t('common.noResults')}
          </Text>
        ) : null}
        {filtered.map((o) => {
          const selected = selectedValues.includes(o.value);
          return (
            <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected }} disabled={o.disabled} onPress={() => toggle(o.value)} style={[styles.option, { borderBottomColor: colors.border, opacity: o.disabled ? 0.5 : 1 }]}>
              {renderOption ? (
                renderOption(o, selected)
              ) : (
                <View style={{ flex: 1 }}>
                  <Text variant={selected ? 'bodyStrong' : 'body'}>{o.label}</Text>
                  {o.subtitle ? (
                    <Text variant="caption" color="textMuted">
                      {o.subtitle}
                    </Text>
                  ) : null}
                </View>
              )}
              <Ionicons name={multiple ? (selected ? 'checkbox' : 'square-outline') : selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.textFaint} />
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, paddingTop: spacing.lg }}>
      <Text variant="label" color="textMuted" style={{ textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text variant="captionStrong" color="primary">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value?: string | null }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 }}>
      <Text color="textMuted">{label}</Text>
      <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, minHeight: 36 },
  selectField: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, minHeight: 48 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 52 },
});
