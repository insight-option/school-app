import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { TimeField } from './fields';
import { WEEKDAYS, type OpeningHours } from '../../../amplify/functions/shared/booking';

/** Default for a new venue: every day 08:00 – 23:00. */
export const DEFAULT_HOURS: OpeningHours = Object.fromEntries(WEEKDAYS.map((d) => [d, [['08:00', '23:00']]])) as OpeningHours;

export const hasAnyOpenDay = (h: OpeningHours) => WEEKDAYS.some((d) => (h[d] ?? []).length > 0);

/**
 * Weekly opening hours (Qatar time): open/closed per weekday, up to two ranges per day, "copy to
 * all days". A range that closes at or before it opens runs past midnight (handled by the backend).
 */
export function OpeningHoursEditor({ value, onChange }: { value: OpeningHours; onChange: (v: OpeningHours) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;

  const setDay = (day: string, ranges: [string, string][]) => {
    const next: OpeningHours = { ...value };
    if (ranges.length) next[day] = ranges;
    else delete next[day];
    onChange(next);
  };

  const copyToAll = (day: string) => {
    const ranges = value[day] ?? [];
    onChange(Object.fromEntries(WEEKDAYS.map((d) => [d, ranges.map(([a, b]) => [a, b] as [string, string])]).filter(([, r]) => (r as unknown[]).length)) as OpeningHours);
    toast.success(t('partner.venueForm.copied'));
  };

  return (
    <View style={{ gap: 4 }}>
      {WEEKDAYS.map((day, i) => {
        const ranges = value[day] ?? [];
        const open = ranges.length > 0;
        return (
          <View key={day} style={[styles.day, i < WEEKDAYS.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null]}>
            <View style={styles.dayHead}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t(`platform.weekday.${day}`)}
              </Text>
              {!open ? (
                <Text variant="caption" color="textFaint">
                  {t('partner.venueForm.closed')}
                </Text>
              ) : null}
              <Switch
                value={open}
                onValueChange={(v) => setDay(day, v ? [['08:00', '23:00']] : [])}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#fff"
                accessibilityLabel={t(`platform.weekday.${day}`)}
              />
            </View>
            {ranges.map(([from, to], r) => (
              <View key={r} style={styles.range}>
                <TimeField label={t('partner.venueForm.open')} value={from} onChange={(v) => setDay(day, ranges.map((x, k) => (k === r ? [v, x[1]] : x)) as [string, string][])} />
                <Ionicons name="arrow-forward" size={16} color={colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
                <TimeField label={t('partner.venueForm.close')} value={to} onChange={(v) => setDay(day, ranges.map((x, k) => (k === r ? [x[0], v] : x)) as [string, string][])} />
                {ranges.length > 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('partner.venueForm.removeRange')} hitSlop={8} onPress={() => setDay(day, ranges.filter((_, k) => k !== r))}>
                    <Ionicons name="close-circle" size={22} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {open ? (
              <View style={styles.dayActions}>
                {ranges.length < 2 ? (
                  <Pressable accessibilityRole="button" hitSlop={6} onPress={() => setDay(day, [...ranges, ['17:00', '23:00']])} style={styles.link}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                    <Text variant="captionStrong" color="primary">
                      {t('partner.venueForm.addRange')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => copyToAll(day)} style={styles.link}>
                  <Ionicons name="copy-outline" size={15} color={colors.textMuted} />
                  <Text variant="captionStrong" color="textMuted">
                    {t('partner.venueForm.copyAll')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { paddingVertical: 10, gap: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dayActions: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
});
