import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Input, Select, SwitchRow, Text, useTheme } from '../../ui';
import { activeCategories, AMENITY_ICONS, AMENITY_KEYS, categoryName, useCategories } from '../../features/platform';
import type { Business, Venue } from '../../lib/data/client';
import type { VenuePayload } from '../../features/partner';
import type { LatLng } from '../../lib/geo';
import { hoursProblem, parseHours, type OpeningHours } from '../../../amplify/functions/shared/booking';
import { ChipSelect, FieldLabel, FormSection, LocationField, RadioCards, Segmented, Stepper } from './fields';
import { DEFAULT_HOURS, OpeningHoursEditor, hasAnyOpenDay } from './OpeningHoursEditor';
import { PhotoGrid } from './PhotoGrid';

type PriceMode = VenuePayload['priceMode'];
type BookingMode = VenuePayload['bookingMode'];

export type VenueDraft = {
  id: string | null;
  name: string;
  categoryId: string;
  listed: boolean;
  description: string;
  photos: string[];
  location: LatLng | null;
  area: string;
  city: string;
  address: string;
  priceMode: PriceMode;
  price: string;
  priceNote: string;
  hours: OpeningHours;
  slotMinutes: number;
  minDuration: number;
  maxDuration: number;
  capacity: number;
  unitLabel: string;
  maxPeople: number | null;
  bookingMode: BookingMode;
  advanceDays: number;
  cancellationHours: number;
  audience: string;
  indoor: boolean | null;
  surface: string;
  amenities: string[];
  rules: string;
  phone: string;
  whatsapp: string;
};

export type VenueErrors = Partial<Record<'name' | 'categoryId' | 'price' | 'hours' | 'duration' | 'contact', string>>;

const SLOTS = [30, 60, 90, 120];

export function draftFromVenue(v: Venue | null | undefined): VenueDraft {
  const hours = v ? parseHours(v.openingHours) : DEFAULT_HOURS;
  const slot = v?.slotMinutes ?? 60;
  return {
    id: v?.id ?? null,
    name: v?.name ?? '',
    categoryId: v?.categoryId ?? '',
    listed: v ? v.listed !== false : true,
    description: v?.description ?? '',
    photos: (v?.photos ?? []).filter((p): p is string => !!p),
    location: v?.location ? { lat: v.location.lat, lng: v.location.lng } : null,
    area: v?.area ?? '',
    city: v?.city ?? '',
    address: v?.address ?? '',
    priceMode: (v?.priceMode as PriceMode) ?? 'PER_HOUR',
    price: v?.price != null ? String(v.price) : '',
    priceNote: v?.priceNote ?? '',
    hours,
    slotMinutes: slot,
    minDuration: v?.minDurationMinutes ?? slot,
    maxDuration: v?.maxDurationMinutes ?? slot * 3,
    capacity: v?.capacity ?? 1,
    unitLabel: v?.unitLabel ?? '',
    maxPeople: v?.maxPeople ?? null,
    bookingMode: (v?.bookingMode as BookingMode) ?? 'INSTANT',
    advanceDays: v?.advanceDays ?? 14,
    cancellationHours: v?.cancellationHours ?? 6,
    audience: v?.audience ?? 'ALL',
    indoor: v?.indoor ?? null,
    surface: v?.surface ?? '',
    amenities: (v?.amenities ?? []).filter((a): a is string => !!a),
    rules: v?.rules ?? '',
    phone: v?.phone ?? '',
    whatsapp: v?.whatsapp ?? '',
  };
}

export function validateVenue(d: VenueDraft, t: (k: string) => string, business?: Pick<Business, 'phone' | 'whatsapp'> | null): VenueErrors {
  const e: VenueErrors = {};
  if (d.name.trim().length < 2) e.name = t('partner.venueForm.errors.name');
  if (!d.categoryId) e.categoryId = t('partner.venueForm.errors.category');
  if (['PER_HOUR', 'PER_SESSION', 'PER_PERSON'].includes(d.priceMode)) {
    const n = Number(d.price.replace(',', '.'));
    if (!d.price.trim() || !isFinite(n) || n <= 0) e.price = t('partner.venueForm.errors.price');
  }
  if (!hasAnyOpenDay(d.hours)) e.hours = t('partner.venueForm.errors.hours');
  else if (hoursProblem(d.hours)) e.hours = t('partner.venueForm.errors.hoursOverlap');
  if (d.maxDuration < d.minDuration) e.duration = t('partner.venueForm.errors.duration');
  if (d.bookingMode === 'CONTACT' && !d.phone.trim() && !d.whatsapp.trim() && !business?.phone && !business?.whatsapp) e.contact = t('partner.venueForm.contactNeedsPhone');
  return e;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function payloadFromDraft(d: VenueDraft): VenuePayload {
  const paid = ['PER_HOUR', 'PER_SESSION', 'PER_PERSON'].includes(d.priceMode);
  return {
    id: d.id,
    name: d.name.trim(),
    categoryId: d.categoryId,
    listed: d.listed,
    description: orNull(d.description),
    photos: d.photos,
    city: orNull(d.city),
    area: orNull(d.area),
    address: orNull(d.address),
    lat: d.location?.lat ?? null,
    lng: d.location?.lng ?? null,
    amenities: d.amenities,
    audience: d.audience || 'ALL',
    indoor: d.indoor,
    surface: orNull(d.surface),
    priceMode: d.priceMode,
    price: paid ? Number(d.price.replace(',', '.')) : null,
    currency: 'QAR',
    priceNote: orNull(d.priceNote),
    openingHours: d.hours,
    slotMinutes: d.slotMinutes,
    minDurationMinutes: d.minDuration,
    maxDurationMinutes: d.maxDuration,
    capacity: d.capacity,
    unitLabel: orNull(d.unitLabel),
    maxPeople: d.maxPeople,
    bookingMode: d.bookingMode,
    advanceDays: d.advanceDays,
    cancellationHours: d.cancellationHours,
    rules: orNull(d.rules),
    phone: orNull(d.phone),
    whatsapp: orNull(d.whatsapp),
  };
}

/** All venue sections: basics, photos, location, pricing, hours, booking rules, details. */
export function VenueForm({ draft, onChange, errors, business }: { draft: VenueDraft; onChange: (patch: Partial<VenueDraft>) => void; errors: VenueErrors; business: Business | null | undefined }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { spacing } = theme;
  const categories = useCategories();
  const arabic = i18n.language === 'ar';
  const catOptions = activeCategories(categories.data, 'ACTIVITY').map((c) => ({ value: c.id, label: categoryName(c, arabic) }));
  const paid = ['PER_HOUR', 'PER_SESSION', 'PER_PERSON'].includes(draft.priceMode);
  const minutesLabel = (m: number) => (m % 60 === 0 ? t('partner.venueForm.durationHours', { count: m / 60 }) : m > 60 ? t('partner.venueForm.durationHours', { count: Math.round((m / 60) * 10) / 10 }) : t('partner.venueForm.durationMinutes', { count: m }));
  const businessLocation = business?.location ? { lat: business.location.lat, lng: business.location.lng } : null;

  const setSlot = (slot: number) => {
    const round = (m: number) => Math.max(slot, Math.round(m / slot) * slot);
    const min = round(draft.minDuration);
    onChange({ slotMinutes: slot, minDuration: min, maxDuration: Math.max(min, round(draft.maxDuration)) });
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <FormSection title={t('partner.venueForm.basics')} icon="information-circle-outline">
        <Input label={t('partner.venueForm.name')} required placeholder={t('partner.venueForm.namePlaceholder')} value={draft.name} onChangeText={(v) => onChange({ name: v })} error={errors.name} maxLength={120} />
        <Select
          label={t('partner.venueForm.category')}
          required
          placeholder={t('partner.venueForm.categoryPick')}
          options={catOptions}
          value={draft.categoryId || null}
          onChange={(v) => onChange({ categoryId: (v as string) ?? '' })}
          error={errors.categoryId}
          searchable={catOptions.length > 8}
        />
        <Input label={t('partner.venueForm.description')} placeholder={t('partner.venueForm.descriptionPlaceholder')} value={draft.description} onChangeText={(v) => onChange({ description: v })} multiline maxLength={4000} style={{ minHeight: 96, textAlignVertical: 'top' }} />
        <SwitchRow label={t('partner.venueForm.listed')} description={t('partner.venueForm.listedHint')} value={draft.listed} onValueChange={(v) => onChange({ listed: v })} />
      </FormSection>

      <FormSection title={t('partner.venueForm.photos')} subtitle={t('partner.venueForm.photosHint')} icon="images-outline">
        <PhotoGrid value={draft.photos} onChange={(photos) => onChange({ photos })} />
      </FormSection>

      <FormSection title={t('partner.venueForm.location')} subtitle={t('partner.venueForm.locationHint')} icon="location-outline">
        <LocationField
          value={draft.location}
          address={draft.address}
          fallback={businessLocation}
          onChange={(v) => onChange({ location: { lat: v.lat, lng: v.lng }, ...(v.address && !draft.address ? { address: v.address } : null) })}
          setLabel={t('partner.venueForm.setLocation')}
          changeLabel={t('partner.venueForm.changeLocation')}
          emptyLabel={t('partner.venueForm.noLocation')}
        />
        <View style={styles.two}>
          <Input label={t('partner.venueForm.area')} placeholder={business?.area || t('partner.venueForm.areaPlaceholder')} value={draft.area} onChangeText={(v) => onChange({ area: v })} containerStyle={styles.flex} />
          <Input label={t('partner.venueForm.city')} placeholder={business?.city ?? ''} value={draft.city} onChangeText={(v) => onChange({ city: v })} containerStyle={styles.flex} />
        </View>
        <Input label={t('partner.venueForm.address')} placeholder={business?.address ?? ''} value={draft.address} onChangeText={(v) => onChange({ address: v })} multiline maxLength={300} />
      </FormSection>

      <FormSection title={t('partner.venueForm.pricing')} icon="pricetag-outline">
        <FieldLabel>{t('partner.venueForm.priceMode')}</FieldLabel>
        <Segmented<PriceMode>
          value={draft.priceMode}
          onChange={(v) => onChange({ priceMode: v })}
          options={(['PER_HOUR', 'PER_SESSION', 'PER_PERSON', 'ON_REQUEST', 'FREE'] as PriceMode[]).map((m) => ({ value: m, label: t(`platform.priceMode.${m}`) }))}
        />
        {paid ? (
          <Input
            label={t('partner.venueForm.price', { currency: 'QAR' })}
            required
            value={draft.price}
            onChangeText={(v) => onChange({ price: v.replace(/[^\d.,]/g, '') })}
            keyboardType="decimal-pad"
            leftIcon="cash-outline"
            error={errors.price}
          />
        ) : null}
        <Input label={t('partner.venueForm.priceNote')} placeholder={t('partner.venueForm.priceNotePlaceholder')} value={draft.priceNote} onChangeText={(v) => onChange({ priceNote: v })} maxLength={200} />
      </FormSection>

      <FormSection title={t('partner.venueForm.hours')} subtitle={t('partner.venueForm.hoursHint')} icon="time-outline">
        <OpeningHoursEditor value={draft.hours} onChange={(hours) => onChange({ hours })} />
        {errors.hours ? (
          <Text variant="caption" color="danger">
            {errors.hours}
          </Text>
        ) : null}
      </FormSection>

      <FormSection title={t('partner.venueForm.rules')} icon="options-outline">
        <FieldLabel>{t('partner.venueForm.slot')}</FieldLabel>
        <Segmented<string> value={String(draft.slotMinutes)} onChange={(v) => setSlot(Number(v))} options={SLOTS.map((s) => ({ value: String(s), label: minutesLabel(s) }))} />
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.minDuration')}</FieldLabel>
            <Stepper value={draft.minDuration} min={draft.slotMinutes} max={1440} step={draft.slotMinutes} format={minutesLabel} onChange={(v) => onChange({ minDuration: v ?? draft.slotMinutes, maxDuration: Math.max(draft.maxDuration, v ?? draft.slotMinutes) })} />
          </View>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.maxDuration')}</FieldLabel>
            <Stepper value={draft.maxDuration} min={draft.minDuration} max={1440} step={draft.slotMinutes} format={minutesLabel} onChange={(v) => onChange({ maxDuration: v ?? draft.minDuration })} />
          </View>
        </View>
        {errors.duration ? (
          <Text variant="caption" color="danger">
            {errors.duration}
          </Text>
        ) : null}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.capacity')}</FieldLabel>
            <Stepper value={draft.capacity} min={1} max={100} onChange={(v) => onChange({ capacity: v ?? 1 })} />
            <Text variant="caption" color="textMuted">
              {t('partner.venueForm.capacityHint')}
            </Text>
          </View>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.maxPeople')}</FieldLabel>
            <Stepper value={draft.maxPeople} min={1} max={500} allowEmpty onChange={(v) => onChange({ maxPeople: v })} />
            <Text variant="caption" color="textMuted">
              {t('partner.venueForm.maxPeopleHint')}
            </Text>
          </View>
        </View>
        <Input label={t('partner.venueForm.unitLabel')} placeholder={t('partner.venueForm.unitLabelPlaceholder')} value={draft.unitLabel} onChangeText={(v) => onChange({ unitLabel: v })} maxLength={40} />
        <FieldLabel>{t('partner.venueForm.bookingMode')}</FieldLabel>
        <RadioCards<BookingMode>
          value={draft.bookingMode}
          onChange={(v) => onChange({ bookingMode: v })}
          options={(['INSTANT', 'REQUEST', 'CONTACT'] as BookingMode[]).map((m) => ({ value: m, label: t(`platform.bookingMode.${m}`), icon: m === 'INSTANT' ? 'flash-outline' : m === 'REQUEST' ? 'hand-left-outline' : 'call-outline' }))}
        />
        {errors.contact ? (
          <Text variant="caption" color="danger">
            {errors.contact}
          </Text>
        ) : null}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.advanceDays')}</FieldLabel>
            <Stepper value={draft.advanceDays} min={1} max={365} onChange={(v) => onChange({ advanceDays: v ?? 1 })} />
          </View>
          <View style={styles.gridItem}>
            <FieldLabel>{t('partner.venueForm.cancellationHours')}</FieldLabel>
            <Stepper value={draft.cancellationHours} min={0} max={720} onChange={(v) => onChange({ cancellationHours: v ?? 0 })} />
          </View>
        </View>
      </FormSection>

      <FormSection title={t('partner.venueForm.details')} icon="sparkles-outline">
        <FieldLabel>{t('partner.venueForm.audience')}</FieldLabel>
        <Segmented<string> value={draft.audience} onChange={(v) => onChange({ audience: v })} options={['ALL', 'MEN', 'WOMEN', 'KIDS', 'FAMILY'].map((a) => ({ value: a, label: t(`platform.audience.${a}`) }))} />
        <FieldLabel>{t('partner.venueForm.setting')}</FieldLabel>
        <Segmented<string>
          value={draft.indoor === null ? 'none' : draft.indoor ? 'in' : 'out'}
          onChange={(v) => onChange({ indoor: v === 'none' ? null : v === 'in' })}
          options={[
            { value: 'in', label: t('partner.venueForm.indoor'), icon: 'home-outline' },
            { value: 'out', label: t('partner.venueForm.outdoor'), icon: 'sunny-outline' },
            { value: 'none', label: t('partner.venueForm.notSet') },
          ]}
        />
        <Input label={t('partner.venueForm.surface')} placeholder={t('partner.venueForm.surfacePlaceholder')} value={draft.surface} onChangeText={(v) => onChange({ surface: v })} maxLength={60} />
        <FieldLabel>{t('partner.venueForm.amenities')}</FieldLabel>
        <ChipSelect options={AMENITY_KEYS.map((k) => ({ value: k, label: t(`platform.amenity.${k}`), icon: AMENITY_ICONS[k] as never }))} value={draft.amenities} onChange={(amenities) => onChange({ amenities })} />
        <Input label={t('partner.venueForm.rulesText')} placeholder={t('partner.venueForm.rulesPlaceholder')} value={draft.rules} onChangeText={(v) => onChange({ rules: v })} multiline maxLength={2000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
        <View style={styles.two}>
          <Input label={t('partner.venueForm.phone')} placeholder={business?.phone ?? ''} value={draft.phone} onChangeText={(v) => onChange({ phone: v })} keyboardType="phone-pad" leftIcon="call-outline" containerStyle={styles.flex} />
          <Input label={t('partner.venueForm.whatsapp')} placeholder={business?.whatsapp ?? ''} value={draft.whatsapp} onChangeText={(v) => onChange({ whatsapp: v })} keyboardType="phone-pad" leftIcon="logo-whatsapp" containerStyle={styles.flex} />
        </View>
        <Text variant="caption" color="textMuted">
          {t('partner.venueForm.contactHint')}
        </Text>
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  two: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexBasis: 200 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { flexGrow: 1, flexBasis: 220, gap: 8 },
});
