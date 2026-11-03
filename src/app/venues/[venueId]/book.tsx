import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Input, Screen, Skeleton, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile } from '../../../features/profiles';
import { bookingPrice, formatMoney, parseHours, priceLabel, qatarNow, toMinutes, useBookVenue, useVenue, useVenueAvailability } from '../../../features/platform';
import { addDays, dayIntervals, fromMinutes, weekdayOf } from '../../../../amplify/functions/shared/booking';
import { haptic } from '../../../lib/util/device';
import type { Booking } from '../../../lib/data/client';

const MAX_DAYS = 30;

/** Book a venue: day → start time → duration → details → confirm. */
export default function BookVenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const venue = useVenue(venueId);
  const me = useMyProfile();
  const book = useBookVenue();

  const [today] = useState(() => qatarNow().date);
  const v = venue.data;
  const hours = useMemo(() => parseHours(v?.openingHours), [v?.openingHours]);
  const days = useMemo(() => Array.from({ length: Math.min(MAX_DAYS, Math.max(1, (v?.advanceDays ?? 14) + 1)) }, (_, i) => addDays(today, i)), [today, v?.advanceDays]);
  const [date, setDate] = useState<string | null>(null);
  const activeDate = date ?? days.find((d) => dayIntervals(hours, d).length > 0) ?? days[0];
  const availability = useVenueAvailability(v?.id, activeDate);
  const slotMinutes = v?.slotMinutes ?? 60;
  const minD = v?.minDurationMinutes ?? slotMinutes;
  const maxD = v?.maxDurationMinutes ?? slotMinutes * 3;
  const durations = useMemo(() => {
    const out: number[] = [];
    for (let d = minD; d <= maxD; d += slotMinutes) out.push(d);
    return out.length ? out : [slotMinutes];
  }, [minD, maxD, slotMinutes]);
  const [start, setStart] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [people, setPeople] = useState(1);
  const [phone, setPhone] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Booking | null>(null);

  const dur = duration ?? durations[0];
  const slots = availability.data?.slots ?? [];
  /** A start works when every slot it covers is free and in the future. */
  const startOk = (time: string, d: number) => {
    const s = toMinutes(time);
    for (let tt = s; tt < s + d; tt += slotMinutes) {
      const slot = slots.find((x) => x?.time === fromMinutes(tt));
      if (!slot || slot.free <= 0 || slot.past) return false;
    }
    return true;
  };
  const chosen = start && startOk(start, dur) ? start : null;
  const price = v ? bookingPrice(v.priceMode, v.price, dur, people) : null;
  const phoneValue = phone ?? me.data?.phone ?? '';

  if (session.status !== 'signedIn') {
    const back = `/venues/${venueId}/book`;
    return (
      <Screen back title={v?.name} maxWidth={560}>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.lock, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="calendar" size={40} color={colors.primary} />
          </View>
          <Text variant="title" align="center">
            {t('platform.book.signInToBook')}
          </Text>
          <Button title={t('platform.book.createAccount')} icon="person-add" size="lg" fullWidth onPress={() => router.push(`/(auth)/sign-up?kind=customer&returnTo=${encodeURIComponent(back)}` as never)} />
          <Button title={t('platform.explore.signInCta')} variant="outline" size="lg" fullWidth onPress={() => router.push(`/(auth)/sign-in?returnTo=${encodeURIComponent(back)}` as never)} />
        </View>
      </Screen>
    );
  }

  if (!v) {
    return (
      <Screen back>
        {venue.isLoading ? <Skeleton height={300} radius={24} /> : <EmptyState icon="alert-circle-outline" title={t('platform.venue.notFound')} />}
      </Screen>
    );
  }

  if (done) {
    const confirmed = done.status === 'CONFIRMED';
    return (
      <Screen maxWidth={560}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.success, { backgroundColor: confirmed ? colors.successSoft : colors.warningSoft }]}>
            <Ionicons name={confirmed ? 'checkmark-circle' : 'time'} size={64} color={confirmed ? colors.success : colors.warning} />
          </View>
          <Text variant="display" align="center">
            {confirmed ? t('platform.book.successTitle') : t('platform.book.successRequestTitle')}
          </Text>
          <Text color="textMuted" align="center">
            {t('platform.book.successBody', { venue: v.name, when: `${done.date} · ${done.startTime}–${done.endTime}` })}
          </Text>
          <View style={[styles.ref, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodyStrong" weight="800" style={{ letterSpacing: 1 }}>
              {t('platform.book.reference', { ref: done.reference })}
            </Text>
          </View>
          <Text variant="caption" color="textMuted" align="center">
            {confirmed ? t('platform.book.instantNote') : t('platform.book.requestNote')}
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: spacing.lg }}>
            {session.role === 'CUSTOMER' ? (
              <Button title={t('platform.book.viewBooking')} icon="receipt" size="lg" fullWidth onPress={() => router.replace(`/(customer)/booking/${done.id}` as never)} />
            ) : null}
            <Button title={t('platform.book.done')} variant="outline" size="lg" fullWidth onPress={() => router.replace('/')} />
          </View>
        </View>
      </Screen>
    );
  }

  const confirm = () => {
    if (!chosen) return;
    haptic('medium');
    book.mutate(
      { venueId: v.id, date: activeDate, startTime: chosen, durationMinutes: dur, people: v.priceMode === 'PER_PERSON' || v.maxPeople ? people : undefined, note: note.trim() || undefined, phone: phoneValue.trim() || undefined },
      {
        onSuccess: (b) => {
          haptic('success');
          if (b) setDone(b);
        },
        onError: (e) => {
          haptic('error');
          toast.error(e.message);
          void availability.refetch();
        },
      },
    );
  };

  const showPeople = v.priceMode === 'PER_PERSON' || !!v.maxPeople;
  const closedDay = dayIntervals(hours, activeDate).length === 0;

  return (
    <Screen back title={t('platform.book.title', { name: v.name })} subtitle={priceLabel(v, t, i18n.language)} maxWidth={720} padded={false}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 140 + insets.bottom, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* ── Day ── */}
        <View style={{ gap: 10 }}>
          <Text variant="overline" color="textMuted">
            {t('platform.book.date')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const selected = d === activeDate;
              const closed = dayIntervals(hours, d).length === 0;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptic('selection');
                    setDate(d);
                    setStart(null);
                  }}
                  style={[
                    styles.day,
                    { borderRadius: radius.lg, backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: closed && !selected ? 0.45 : 1 },
                    selected ? theme.shadow.glow : null,
                  ]}
                >
                  <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.textMuted, letterSpacing: 0 }}>
                    {d === today ? t('platform.venue.today') : t(`platform.weekdayShort.${weekdayOf(d)}`)}
                  </Text>
                  <Text variant="heading" weight="800" style={{ color: selected ? colors.onPrimary : colors.text }}>
                    {Number(d.slice(8, 10))}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Time ── */}
        <View style={{ gap: 10 }}>
          <Text variant="overline" color="textMuted">
            {t('platform.book.time')}
          </Text>
          {availability.isLoading ? (
            <View style={styles.slotGrid}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} width={96} height={56} radius={16} />
              ))}
            </View>
          ) : closedDay ? (
            <Card tone="muted">
              <Text color="textMuted">{t('platform.book.closedDay')}</Text>
            </Card>
          ) : !slots.some((s) => s && !s.past && s.free > 0) ? (
            <Card tone="muted">
              <Text color="textMuted">{t('platform.book.noSlots')}</Text>
            </Card>
          ) : (
            <View style={styles.slotGrid}>
              {slots.map((s) => {
                if (!s || s.past) return null;
                const ok = startOk(s.time, dur);
                const selected = chosen === s.time;
                return (
                  <Pressable
                    key={s.time}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !ok }}
                    disabled={!ok}
                    onPress={() => {
                      haptic('selection');
                      setStart(s.time);
                    }}
                    style={[
                      styles.slot,
                      { borderRadius: radius.lg, backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border, opacity: ok ? 1 : 0.4 },
                    ]}
                  >
                    <Text variant="bodyStrong" weight="800" style={{ color: selected ? colors.onPrimary : colors.text }}>
                      {s.time}
                    </Text>
                    <Text variant="label" style={{ color: selected ? colors.onPrimary : s.free > 0 ? colors.success : colors.textFaint, letterSpacing: 0 }}>
                      {s.free > 0 ? (s.capacity > 1 ? t('platform.book.left', { count: s.free }) : '✓') : t('platform.book.full')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Duration ── */}
        {durations.length > 1 ? (
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="textMuted">
              {t('platform.book.duration')}
            </Text>
            <View style={styles.slotGrid}>
              {durations.map((d) => {
                const selected = d === dur;
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setDuration(d)}
                    style={[styles.pill, { backgroundColor: selected ? colors.inverse : colors.surface, borderColor: selected ? colors.inverse : colors.border }]}
                  >
                    <Text variant="captionStrong" weight="800" style={{ color: selected ? colors.onInverse : colors.text }}>
                      {d % 60 === 0 ? t('platform.book.hours', { count: d / 60 }) : t('platform.book.minutes', { count: d })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ── Details ── */}
        <View style={{ gap: spacing.md }}>
          {showPeople ? (
            <View style={[styles.stepperRow, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border }]}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t('platform.book.people')}
              </Text>
              <Stepper value={people} min={1} max={v.maxPeople ?? 50} onChange={setPeople} />
            </View>
          ) : null}
          <Input label={t('platform.book.phone')} helper={t('platform.book.phoneHelp')} value={phoneValue} onChangeText={setPhone} keyboardType="phone-pad" leftIcon="call-outline" />
          <Input label={t('platform.book.note')} value={note} onChangeText={setNote} multiline maxLength={500} style={{ minHeight: 70, textAlignVertical: 'top' }} />
        </View>
      </ScrollView>

      {/* ── Summary bar ── */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }, theme.shadow.sheet]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" color="textMuted" style={{ letterSpacing: 0 }}>
            {chosen ? `${activeDate} · ${chosen}–${fromMinutes(toMinutes(chosen) + dur)}` : t('platform.book.pickTime')}
          </Text>
          <Text variant="heading" weight="800">
            {price == null ? t('platform.price.onRequest') : price === 0 ? t('platform.price.free') : formatMoney(price, v.currency ?? 'QAR', i18n.language)}
          </Text>
          {price ? (
            <Text variant="label" color="textFaint" style={{ letterSpacing: 0 }}>
              {t('platform.price.payAtVenue')}
            </Text>
          ) : null}
        </View>
        <Button
          title={v.bookingMode === 'REQUEST' ? t('platform.book.sendRequest') : t('platform.book.confirm')}
          icon="checkmark-circle"
          size="lg"
          disabled={!chosen}
          loading={book.isPending}
          onPress={confirm}
          style={{ minWidth: 170 }}
          testID="book-confirm"
        />
      </View>
    </Screen>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const theme = useTheme();
  const btn = (icon: 'remove' | 'add', next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onChange(next)}
      style={[styles.stepBtn, { backgroundColor: theme.colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {btn('remove', value - 1, value <= min)}
      <Text variant="subheading" weight="800" style={{ minWidth: 28, textAlign: 'center' }}>
        {value}
      </Text>
      {btn('add', value + 1, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  lock: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  success: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ref: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  day: { width: 64, height: 76, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: 96, height: 58, alignItems: 'center', justifyContent: 'center', borderWidth: 1, gap: 1 },
  pill: { paddingHorizontal: 16, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', start: 0, end: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
});
