import React, { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, Gradient, PressableScale, Skeleton, Text, useTheme } from '../../ui';
import { shade, withAlpha } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { StorageImage, SchoolLogo } from '../media/StorageImage';
import { VenueCard, VenueRow, useMinuteClock } from './VenueCard';
import { BrandMark } from './BrandMark';
import { useBranding } from '../../features/branding';
import { activeCategories, categoryName, filterVenues, rankVenues, useCategories, useDirectoryVenues } from '../../features/platform';
import { useDirectorySchools } from '../../features/directory';
import { filterSchools } from '../../lib/directory';
import { currentLanguage, setAppLanguage } from '../../lib/i18n';
import { useSession } from '../../lib/auth/session';
import { haptic } from '../../lib/util/device';
import type { Category, School, Venue } from '../../lib/data/client';

type IconName = keyof typeof Ionicons.glyphMap;
const MAX_WIDTH = 1180;

/**
 * Home of the app for guests and customers: branded hero, instant search across venues and
 * schools, categories, featured & popular venues, schools and the "list your business" call to action.
 */
export function ExploreScreen({ mode }: { mode: 'guest' | 'customer' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const branding = useBranding();
  const session = useSession();
  const categories = useCategories();
  const venues = useDirectoryVenues();
  const schools = useDirectorySchools();
  const now = useMinuteClock();
  const [hour] = useState(() => new Date().getHours());
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());

  const sidePad = Math.max(spacing.lg, (width - MAX_WIDTH) / 2 + spacing.lg);
  const wide = width >= 900;
  const cats = useMemo(() => activeCategories(categories.data), [categories.data]);
  const catById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const allVenues = useMemo(() => rankVenues(venues.data ?? []), [venues.data]);
  const featured = useMemo(() => allVenues.filter((v) => v.featured).slice(0, 10), [allVenues]);
  const popular = useMemo(() => allVenues.filter((v) => !v.featured).slice(0, 12), [allVenues]);
  const schoolList = useMemo(() => (schools.data ?? []).filter((s) => s.status !== 'SUSPENDED'), [schools.data]);
  const searching = deferred.length > 0;
  const venueHits = useMemo(
    () => (searching ? filterVenues(allVenues, { query: deferred }, (id) => categoryName(catById.get(id), theme.arabic)) : []),
    [searching, allVenues, deferred, catById, theme.arabic],
  );
  const schoolHits = useMemo(() => (searching ? filterSchools(schoolList, { query: deferred, openOnly: false, transportOnly: false, curriculum: null }) : []), [searching, schoolList, deferred]);

  const greeting = hour < 12 ? t('platform.explore.greetingMorning') : hour < 18 ? t('platform.explore.greetingAfternoon') : t('platform.explore.greetingEvening');
  const firstName = session.name?.split(' ')[0];

  const openVenue = (v: Venue) => {
    haptic('selection');
    router.push(`/venues/${v.id}` as never);
  };
  const openSchool = (s: School) => {
    haptic('selection');
    router.push(`/schools/${s.schoolId}` as never);
  };
  const openCategory = (c: Category) => {
    haptic('selection');
    router.push(`/explore/${c.kind === 'SCHOOL' ? 'schools' : c.id}` as never);
  };
  const toggleLanguage = async () => {
    const restart = await setAppLanguage(currentLanguage() === 'ar' ? 'en' : 'ar');
    if (restart) toast.info(t('common.restartRequired'));
  };
  const refreshing = (venues.isRefetching || schools.isRefetching) && !venues.isLoading;
  const refresh = () => {
    void venues.refetch();
    void schools.refetch();
    void categories.refetch();
  };

  const cardWidth = wide ? 300 : Math.min(300, width * 0.74);
  // The hero always wears the true brand colour (dark mode only lifts it for text and buttons).
  const heroColor = branding.primaryColor;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: spacing.huge + (mode === 'guest' ? insets.bottom : 0) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {/* ── Hero ── */}
        <Gradient stops={[shade(heroColor, 10), heroColor, shade(heroColor, -34)]} angle={150} style={[styles.hero, { paddingTop: insets.top + spacing.md, paddingHorizontal: sidePad }]}>
          <View style={[styles.orb, { width: 320, height: 320, top: -140, end: -110, backgroundColor: withAlpha(colors.accent, 0.22) }]} />
          <View style={[styles.orb, { width: 200, height: 200, bottom: -90, start: -70, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
          <View style={styles.topBar}>
            <BrandMark size={40} onDark />
            <Text variant="subheading" numberOfLines={1} style={{ flex: 1, color: '#FFFFFF' }}>
              {branding.appName}
            </Text>
            <Pressable accessibilityRole="button" onPress={toggleLanguage} hitSlop={8} style={styles.glassPill}>
              <Text variant="captionStrong" style={{ color: '#FFFFFF' }}>
                {currentLanguage() === 'ar' ? 'EN' : 'ع'}
              </Text>
            </Pressable>
            {mode === 'guest' ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/sign-in' as never)} style={[styles.glassPill, { paddingHorizontal: 14 }]} testID="landing-sign-in">
                <Ionicons name="person-circle-outline" size={18} color="#FFFFFF" />
                <Text variant="captionStrong" style={{ color: '#FFFFFF' }}>
                  {t('platform.explore.signInCta')}
                </Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications' as never)} style={styles.glassPill}>
                <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
              </Pressable>
            )}
          </View>

          <View style={{ gap: 8, marginTop: spacing.xxl, maxWidth: 640 }}>
            <Text variant="captionStrong" style={{ color: withAlpha('#FFFFFF', 0.8) }}>
              {mode === 'customer' && firstName ? `${greeting}, ${firstName}` : greeting}
            </Text>
            <Text variant={wide ? 'hero' : 'display'} style={{ color: '#FFFFFF' }}>
              {branding.heroTitle ?? t('platform.explore.heroTitle')}
            </Text>
            <Text style={{ color: withAlpha('#FFFFFF', 0.86), fontSize: 15, lineHeight: 22 }}>{branding.heroSubtitle ?? t('platform.explore.heroSubtitle')}</Text>
          </View>

          <View style={[styles.search, { backgroundColor: colors.surface, borderRadius: radius.xl }, theme.shadow.raised]}>
            <Ionicons name="search" size={21} color={colors.primary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('platform.explore.searchPlaceholder')}
              placeholderTextColor={colors.textFaint}
              style={[styles.searchInput, { color: colors.text, fontFamily: theme.fonts.medium, textAlign: theme.arabic ? 'right' : 'left' }]}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel={t('platform.explore.searchPlaceholder')}
              testID="explore-search"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} hitSlop={10} onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        </Gradient>

        <View style={{ paddingHorizontal: sidePad, gap: spacing.xxl, marginTop: spacing.xl }}>
          {branding.announcement && !searching ? (
            <View style={[styles.announce, { backgroundColor: colors.accentSoft, borderRadius: radius.lg }]}>
              <Ionicons name="megaphone" size={18} color={colors.accent} />
              <Text variant="captionStrong" style={{ flex: 1 }}>
                {branding.announcement}
              </Text>
            </View>
          ) : null}

          {searching ? (
            <SearchResults
              venues={venueHits}
              schools={schoolHits}
              catById={catById}
              now={now}
              onVenue={openVenue}
              onSchool={openSchool}
              onClear={() => setQuery('')}
              columns={wide ? 2 : 1}
            />
          ) : (
            <>
              {/* ── Categories ── */}
              <Section title={t('platform.explore.categories')}>
                {categories.isLoading && !categories.data ? (
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} width={86} height={96} radius={22} />
                    ))}
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 8 }} style={{ marginHorizontal: -4 }}>
                    {cats.map((c) => (
                      <CategoryTile key={c.id} category={c} onPress={() => openCategory(c)} />
                    ))}
                    {!cats.some((c) => c.kind === 'SCHOOL') ? (
                      <CategoryTile category={{ id: 'schools', kind: 'SCHOOL', nameEn: 'Schools', nameAr: 'المدارس', icon: 'school', color: '#8A1538' } as Category} onPress={() => router.push('/explore/schools' as never)} />
                    ) : null}
                  </ScrollView>
                )}
              </Section>

              {/* ── Featured ── */}
              {venues.isLoading && !venues.data ? (
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {[0, 1].map((i) => (
                    <Skeleton key={i} width={cardWidth} height={250} radius={24} />
                  ))}
                </View>
              ) : featured.length ? (
                <Section title={t('platform.explore.featured')} icon="star">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 14} decelerationRate="fast" contentContainerStyle={{ gap: 14, paddingEnd: 8, paddingVertical: 6 }} style={{ marginHorizontal: -6, paddingHorizontal: 6 }}>
                    {featured.map((v) => (
                      <VenueCard key={v.id} venue={v} category={catById.get(v.categoryId)} now={now} width={cardWidth} onPress={() => openVenue(v)} />
                    ))}
                  </ScrollView>
                </Section>
              ) : null}

              {/* ── Popular ── */}
              {popular.length ? (
                <Section
                  title={t('platform.explore.popular')}
                  icon="flame"
                  action={allVenues.length > featured.length + popular.length ? t('platform.explore.seeAll') : undefined}
                  onAction={() => router.push('/explore/all' as never)}
                >
                  <View style={[styles.grid, wide && styles.gridWide]}>
                    {popular.map((v) => (
                      <View key={v.id} style={wide ? { width: '48.8%' } : undefined}>
                        <VenueRow venue={v} category={catById.get(v.categoryId)} now={now} onPress={() => openVenue(v)} />
                      </View>
                    ))}
                  </View>
                </Section>
              ) : !venues.isLoading && !allVenues.length ? (
                <View style={[styles.emptyVenues, { backgroundColor: colors.surface, borderRadius: radius.xl, borderColor: colors.border }]}>
                  <Ionicons name="sparkles-outline" size={28} color={colors.primary} />
                  <Text variant="subheading" align="center">
                    {t('platform.explore.emptyTitle')}
                  </Text>
                  <Text variant="caption" color="textMuted" align="center">
                    {t('platform.explore.emptyBody')}
                  </Text>
                </View>
              ) : null}

              {/* ── Schools ── */}
              <Section title={t('platform.explore.schools')} icon="school" action={t('platform.explore.allSchools')} onAction={() => router.push('/explore/schools' as never)}>
                {schools.isLoading && !schools.data ? (
                  <Skeleton height={120} radius={24} />
                ) : schoolList.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 8, paddingVertical: 4 }}>
                    {schoolList.slice(0, 12).map((s) => (
                      <SchoolTile key={s.schoolId} school={s} onPress={() => openSchool(s)} />
                    ))}
                  </ScrollView>
                ) : (
                  <Text variant="caption" color="textMuted">
                    {t('platform.explore.schoolsSubtitle')}
                  </Text>
                )}
              </Section>

              {/* ── List your business ── */}
              <View style={[styles.cta, { backgroundColor: colors.inverse, borderRadius: radius.xxl }, theme.shadow.raised]}>
                <View style={[styles.orb, { width: 220, height: 220, top: -100, end: -80, backgroundColor: withAlpha(colors.accent, 0.25) }]} />
                <View style={[styles.ctaIcon, { backgroundColor: withAlpha(colors.accent, 0.2) }]}>
                  <Ionicons name="storefront" size={24} color={colors.accent} />
                </View>
                <Text variant="heading" style={{ color: colors.onInverse }}>
                  {t('platform.explore.listBusinessTitle')}
                </Text>
                <Text variant="caption" style={{ color: withAlpha(theme.scheme === 'dark' ? '#16131A' : '#FFFFFF', 0.75) }}>
                  {t('platform.explore.listBusinessBody')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  <Button title={t('platform.explore.listBusinessCta')} icon="add-circle" onPress={() => router.push('/(auth)/sign-up?kind=business' as never)} />
                  <Button
                    title={t('landing.createSchool')}
                    icon="school-outline"
                    variant="outline"
                    style={{ borderColor: withAlpha(theme.scheme === 'dark' ? '#16131A' : '#FFFFFF', 0.3) }}
                    onPress={() => router.push('/(auth)/sign-up?kind=school' as never)}
                  />
                </View>
              </View>

              {branding.supportEmail || branding.whatsapp || branding.instagram ? (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Text variant="caption" color="textFaint" align="center">
                    {[branding.appName, branding.supportEmail, branding.whatsapp, branding.instagram ? `@${branding.instagram.replace(/^@/, '')}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, action, onAction, children }: { title: string; icon?: IconName; action?: string; onAction?: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHead}>
        {icon ? <Ionicons name={icon} size={18} color={theme.colors.primary} /> : null}
        <Text variant="heading" style={{ flex: 1 }}>
          {title}
        </Text>
        {action && onAction ? (
          <Pressable accessibilityRole="link" onPress={onAction} hitSlop={8} style={styles.sectionAction}>
            <Text variant="captionStrong" color="primary">
              {action}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function CategoryTile({ category, onPress }: { category: Category; onPress: () => void }) {
  const theme = useTheme();
  const color = category.color && /^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : theme.colors.primary;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={categoryName(category, theme.arabic)}>
      <View style={[styles.catTile, { backgroundColor: theme.colors.surface, borderRadius: 22 }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: theme.colors.border } : null, theme.shadow.card]}>
        <View style={[styles.catIcon, { backgroundColor: withAlpha(color, theme.scheme === 'dark' ? 0.22 : 0.12) }]}>
          <Ionicons name={(category.icon as IconName) || 'grid'} size={24} color={color} />
        </View>
        <Text variant="label" align="center" numberOfLines={2} style={{ letterSpacing: 0 }}>
          {categoryName(category, theme.arabic)}
        </Text>
      </View>
    </PressableScale>
  );
}

function SchoolTile({ school, onPress }: { school: School; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={school.name}>
      <View style={[styles.schoolTile, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: theme.colors.border } : null, theme.shadow.card]}>
        {school.coverKey ? <StorageImage storageKey={school.coverKey} style={[StyleSheet.absoluteFill, { height: 64 }]} /> : null}
        <SchoolLogo logoKey={school.logoKey} name={school.name} color={school.primaryColor} size={52} />
        <Text variant="bodyStrong" weight="700" numberOfLines={2}>
          {school.name}
        </Text>
        <Text variant="caption" color={school.applicationsOpen ? 'success' : 'textFaint'} weight="700" numberOfLines={1}>
          {school.applicationsOpen ? t('landing.open') : t('landing.closed')}
        </Text>
      </View>
    </PressableScale>
  );
}

function SearchResults({
  venues,
  schools,
  catById,
  now,
  onVenue,
  onSchool,
  onClear,
  columns,
}: {
  venues: Venue[];
  schools: School[];
  catById: Map<string, Category>;
  now: number;
  onVenue: (v: Venue) => void;
  onSchool: (s: School) => void;
  onClear: () => void;
  columns: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!venues.length && !schools.length) {
    return <EmptyState icon="search-outline" title={t('platform.explore.noResults')} body={t('platform.explore.noResultsBody')} actionLabel={t('platform.explore.clear')} onAction={onClear} />;
  }
  return (
    <View style={{ gap: 14 }}>
      <Text variant="captionStrong" color="textMuted">
        {t('platform.explore.results', { count: venues.length + schools.length })}
      </Text>
      <View style={[styles.grid, columns > 1 && styles.gridWide]}>
        {venues.map((v) => (
          <View key={v.id} style={columns > 1 ? { width: '48.8%' } : undefined}>
            <VenueRow venue={v} category={catById.get(v.categoryId)} now={now} onPress={() => onVenue(v)} />
          </View>
        ))}
      </View>
      {schools.map((s) => (
        <PressableScale key={s.schoolId} onPress={() => onSchool(s)}>
          <View style={[styles.schoolRow, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl }, theme.shadow.card]}>
            <SchoolLogo logoKey={s.logoKey} name={s.name} color={s.primaryColor} size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" weight="700" numberOfLines={1}>
                {s.name}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {[t('platform.explore.schools'), s.city].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { overflow: 'hidden', paddingBottom: 26, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  orb: { position: 'absolute', borderRadius: 999 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glassPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 58, marginTop: 22, maxWidth: 720 },
  searchInput: { flex: 1, fontSize: 16, height: '100%', outlineStyle: 'none' } as object,
  announce: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  catTile: { width: 92, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 8, margin: 4 },
  catIcon: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { gap: 12 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  emptyVenues: { alignItems: 'center', gap: 8, padding: 26, borderWidth: 1, borderStyle: 'dashed' },
  schoolTile: { width: 168, padding: 14, gap: 8, overflow: 'hidden' },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cta: { overflow: 'hidden', padding: 24, gap: 8 },
  ctaIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
