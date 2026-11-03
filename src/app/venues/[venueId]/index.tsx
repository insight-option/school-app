import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, EmptyState, Skeleton, Text, useTheme } from '../../../ui';
import { StorageImage } from '../../../components/media/StorageImage';
import { MapView } from '../../../components/map/MapView';
import { VenueCover, VenueRow, useMinuteClock } from '../../../components/explore/VenueCard';
import {
  AMENITY_ICONS,
  categoryName,
  isOpenNow,
  parseHours,
  priceLabel,
  useBusiness,
  useCategories,
  useDirectoryVenues,
  useVenue,
} from '../../../features/platform';
import { shareText } from '../../../lib/util/device';

type IconName = keyof typeof Ionicons.glyphMap;
const MAX_WIDTH = 860;
const DAYS = ['0', '1', '2', '3', '4', '5', '6'];

/** Public page of a venue: gallery, facts, hours, amenities, map and the booking call to action. */
export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const venue = useVenue(venueId);
  const categories = useCategories();
  const business = useBusiness(venue.data?.businessId);
  const directory = useDirectoryVenues();
  const now = useMinuteClock();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [today] = useState(() => String(new Date(Date.now() + 3 * 3_600_000).getUTCDay()));

  const v = venue.data;
  const category = categories.data?.find((c) => c.id === v?.categoryId);
  const hours = useMemo(() => parseHours(v?.openingHours), [v?.openingHours]);
  const more = useMemo(() => (directory.data ?? []).filter((x) => x.businessId === v?.businessId && x.id !== v?.id).slice(0, 4), [directory.data, v?.businessId, v?.id]);
  const pageWidth = Math.min(width, MAX_WIDTH);
  const heroHeight = Math.min(380, Math.round(pageWidth * 0.72));

  if (!v) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {venue.isLoading ? (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <Skeleton height={280} radius={28} />
            <Skeleton width="60%" height={26} />
            <Skeleton width="40%" height={16} />
          </View>
        ) : (
          <EmptyState icon="alert-circle-outline" title={t('platform.venue.notFound')} actionLabel={t('platform.venue.back')} onAction={() => router.replace('/')} />
        )}
      </View>
    );
  }

  const photos = v.photos ?? [];
  const open = isOpenNow(hours, now);
  const place = [v.area, v.city].filter(Boolean).join(', ');
  const phone = v.phone || business.data?.phone;
  const whatsapp = v.whatsapp || business.data?.whatsapp;
  const unitLabel = v.unitLabel || t('platform.venue.unitDefault');
  const ctaLabel = v.bookingMode === 'CONTACT' ? t('platform.venue.contactToBook') : v.bookingMode === 'REQUEST' ? t('platform.venue.requestBooking') : t('platform.venue.bookNow');

  const directions = () => {
    if (!v.location) return;
    const { lat, lng } = v.location;
    void Linking.openURL(Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };
  const book = () => {
    if (v.bookingMode === 'CONTACT') {
      if (whatsapp) void Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}`);
      else if (phone) void Linking.openURL(`tel:${phone}`);
      return;
    }
    router.push(`/venues/${v.id}/book` as never);
  };

  const facts: { icon: IconName; label: string; value: string }[] = [
    { icon: 'pricetag', label: t('platform.price.total'), value: priceLabel(v, t, i18n.language) },
    ...(v.capacity && v.capacity > 1 ? [{ icon: 'grid' as IconName, label: t('platform.venue.details'), value: t('platform.venue.units', { count: v.capacity, label: unitLabel }) }] : []),
    ...(v.maxPeople ? [{ icon: 'people' as IconName, label: t('platform.book.people'), value: t('platform.venue.upTo', { count: v.maxPeople }) }] : []),
    ...(v.audience ? [{ icon: 'person' as IconName, label: t('platform.venue.audience'), value: t(`platform.audience.${v.audience}`) }] : []),
    ...(v.indoor != null ? [{ icon: (v.indoor ? 'business' : 'sunny') as IconName, label: t('platform.venue.indoorOutdoor'), value: v.indoor ? t('platform.explore.indoor') : t('platform.explore.outdoor') }] : []),
    ...(v.surface ? [{ icon: 'layers' as IconName, label: t('platform.venue.surface'), value: v.surface }] : []),
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
          {/* ── Gallery ── */}
          <View style={{ height: heroHeight }}>
            {photos.length > 1 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
                style={{ width: pageWidth }}
              >
                {photos.map((key) => (
                  <StorageImage key={key} storageKey={key} style={{ width: pageWidth, height: heroHeight }} />
                ))}
              </ScrollView>
            ) : (
              <VenueCover venue={v} category={category} height={heroHeight} />
            )}
            <View style={[styles.heroBar, { top: insets.top + 8 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.glass}>
                <Ionicons name="arrow-back" size={21} color="#FFFFFF" style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('platform.venue.share')} onPress={() => void shareText(`${v.name} – ${v.businessName ?? ''}`)} style={styles.glass}>
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
            {photos.length > 1 ? (
              <View style={styles.dots}>
                {photos.map((key, i) => (
                  <View key={key} style={[styles.dot, { backgroundColor: i === photoIndex ? '#FFFFFF' : 'rgba(255,255,255,0.5)', width: i === photoIndex ? 18 : 7 }]} />
                ))}
              </View>
            ) : null}
          </View>

          {/* ── Sheet ── */}
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingHorizontal: spacing.lg }]}>
            <View style={styles.badges}>
              {category ? <Badge label={categoryName(category, theme.arabic)} tone="primary" /> : null}
              <Badge label={open ? t('platform.explore.openNow') : t('platform.explore.closed')} tone={open ? 'success' : 'neutral'} />
              {v.featured ? <Badge label={t('platform.explore.featured')} tone="accent" icon="star" /> : null}
            </View>
            <Text variant="display" style={{ marginTop: 6 }}>
              {v.name}
            </Text>
            {v.businessName ? (
              <Pressable accessibilityRole="link" onPress={() => router.push(`/businesses/${v.businessId}` as never)} style={styles.businessLink}>
                <Text variant="bodyStrong" color="primary">
                  {v.businessName}
                </Text>
                {business.data?.verified ? <Ionicons name="checkmark-circle" size={16} color={colors.info} /> : null}
                <Ionicons name="chevron-forward" size={15} color={colors.primary} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
              </Pressable>
            ) : null}
            {place ? (
              <View style={styles.inline}>
                <Ionicons name="location" size={15} color={colors.textMuted} />
                <Text color="textMuted">{place}</Text>
              </View>
            ) : null}

            {/* quick actions */}
            <View style={styles.actions}>
              {phone ? <Action icon="call" label={t('platform.venue.call')} onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
              {whatsapp ? <Action icon="logo-whatsapp" label={t('platform.venue.whatsapp')} onPress={() => void Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}`)} /> : null}
              {v.location ? <Action icon="navigate" label={t('platform.venue.directions')} onPress={directions} /> : null}
              <Action icon="share-social" label={t('platform.venue.share')} onPress={() => void shareText(`${v.name} – ${v.businessName ?? ''}`)} />
            </View>

            {/* facts */}
            <View style={styles.facts}>
              {facts.map((f) => (
                <View key={f.label + f.value} style={[styles.fact, { backgroundColor: colors.surface, borderRadius: radius.lg }, theme.shadow.card]}>
                  <View style={[styles.factIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name={f.icon} size={17} color={colors.primary} />
                  </View>
                  <Text variant="label" color="textMuted" numberOfLines={1} style={{ letterSpacing: 0 }}>
                    {f.label}
                  </Text>
                  <Text variant="bodyStrong" weight="700" numberOfLines={2}>
                    {f.value}
                  </Text>
                </View>
              ))}
            </View>

            {v.description ? (
              <Block title={t('platform.venue.about')}>
                <Text color="textMuted" style={{ lineHeight: 23 }}>
                  {v.description}
                </Text>
              </Block>
            ) : null}

            {v.amenities?.length ? (
              <Block title={t('platform.venue.amenities')}>
                <View style={styles.amenities}>
                  {v.amenities.filter((a): a is string => !!a).map((a) => (
                    <View key={a} style={[styles.amenity, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name={(AMENITY_ICONS[a] as IconName) ?? 'checkmark-circle'} size={16} color={colors.primary} />
                      <Text variant="captionStrong">{t(`platform.amenity.${a}`, { defaultValue: a })}</Text>
                    </View>
                  ))}
                </View>
              </Block>
            ) : null}

            {Object.keys(hours).length ? (
              <Block title={t('platform.venue.hours')}>
                <View style={[styles.hours, { backgroundColor: colors.surface, borderRadius: radius.xl }, theme.shadow.card]}>
                  {DAYS.map((d) => {
                    const ranges = hours[d];
                    const isToday = d === today;
                    return (
                      <View key={d} style={[styles.hourRow, isToday ? { backgroundColor: colors.primarySoft } : null]}>
                        <Text variant={isToday ? 'bodyStrong' : 'body'} color={isToday ? 'primary' : 'text'} style={{ flex: 1 }}>
                          {t(`platform.weekday.${d}`)}
                          {isToday ? ` · ${t('platform.venue.today')}` : ''}
                        </Text>
                        <Text variant={isToday ? 'bodyStrong' : 'body'} color={ranges?.length ? 'text' : 'textFaint'}>
                          {ranges?.length ? ranges.map(([a, b]) => `${a} – ${b}`).join(', ') : t('platform.explore.closed')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Block>
            ) : null}

            <Block title={t('platform.venue.rules')}>
              <View style={[styles.note, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
                <Ionicons name="shield-checkmark" size={18} color={colors.success} />
                <Text style={{ flex: 1 }}>
                  {v.cancellationHours ? t('platform.venue.cancellation', { hours: v.cancellationHours }) : t('platform.venue.noCancellationLimit')}
                </Text>
              </View>
              {v.rules ? (
                <Text color="textMuted" style={{ lineHeight: 23 }}>
                  {v.rules}
                </Text>
              ) : null}
            </Block>

            {v.location ? (
              <Block title={t('platform.venue.location')}>
                <Pressable accessibilityRole="button" onPress={directions} style={[styles.map, { borderRadius: radius.xl }]}>
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <MapView
                      markers={[{ id: 'venue', kind: 'pin', lat: v.location.lat, lng: v.location.lng, color: colors.primary }]}
                      initialRegion={{ lat: v.location.lat, lng: v.location.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
                    />
                  </View>
                  <View style={[styles.mapCta, { backgroundColor: colors.surface }, theme.shadow.raised]}>
                    <Ionicons name="navigate" size={16} color={colors.primary} />
                    <Text variant="captionStrong" color="primary">
                      {t('platform.venue.directions')}
                    </Text>
                  </View>
                </Pressable>
                {v.address ? <Text color="textMuted">{v.address}</Text> : null}
              </Block>
            ) : null}

            {more.length ? (
              <Block title={t('platform.venue.moreFrom', { name: v.businessName ?? '' })}>
                <View style={{ gap: 12 }}>
                  {more.map((m) => (
                    <VenueRow key={m.id} venue={m} category={categories.data?.find((c) => c.id === m.categoryId)} now={now} onPress={() => router.push(`/venues/${m.id}` as never)} />
                  ))}
                </View>
              </Block>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ── Booking bar ── */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }, theme.shadow.sheet]}>
        <View style={{ flex: 1 }}>
          <Text variant="label" color="textMuted" style={{ letterSpacing: 0 }}>
            {t('platform.price.total')}
          </Text>
          <Text variant="subheading" weight="800" numberOfLines={1}>
            {priceLabel(v, t, i18n.language)}
          </Text>
        </View>
        <Button
          title={ctaLabel}
          icon={v.bookingMode === 'CONTACT' ? 'call' : 'calendar'}
          size="lg"
          onPress={book}
          disabled={v.bookingMode === 'CONTACT' && !phone && !whatsapp}
          style={{ minWidth: 170 }}
          testID="venue-book"
        />
      </View>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12, marginTop: 26 }}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.actionIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, theme.shadow.card]}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text variant="label" color="textMuted" style={{ letterSpacing: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  heroBar: { position: 'absolute', start: 16, end: 16, flexDirection: 'row', justifyContent: 'space-between' },
  glass: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,19,26,0.42)' },
  dots: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { height: 7, borderRadius: 4 },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  businessLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 20, flexWrap: 'wrap' },
  action: { alignItems: 'center', gap: 6, minWidth: 64 },
  actionIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  fact: { flexGrow: 1, flexBasis: '30%', minWidth: 140, padding: 14, gap: 6 },
  factIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenity: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  hours: { overflow: 'hidden', paddingVertical: 6 },
  hourRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  map: { height: 200, overflow: 'hidden' },
  mapCta: { position: 'absolute', bottom: 12, end: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  bar: { position: 'absolute', start: 0, end: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
});

