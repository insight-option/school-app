import React, { useDeferredValue, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, EmptyState, ErrorState, Gradient, Skeleton, Text, useTheme } from '../../ui';
import { shade } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { SchoolCard } from './SchoolCard';
import { useDirectorySchools } from '../../features/directory';
import { filterSchools, topCurricula } from '../../lib/directory';
import { currentLanguage, setAppLanguage } from '../../lib/i18n';
import { haptic } from '../../lib/util/device';
import type { School } from '../../lib/data/client';

const MAX_WIDTH = 1200;

/**
 * Landing screen for everyone who is not signed in: the public school directory with instant
 * search and filters, plus the two entry points – "Sign in" and "Create my school".
 */
export function DirectoryScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const schools = useDirectorySchools();

  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [transportOnly, setTransportOnly] = useState(false);
  const [curriculum, setCurriculum] = useState<string | null>(null);
  // Typing stays at 60 fps: filtering runs on the deferred value.
  const deferredQuery = useDeferredValue(query);

  const all = useMemo(() => schools.data ?? [], [schools.data]);
  const curricula = useMemo(() => topCurricula(all), [all]);
  const rows = useMemo(() => filterSchools(all, { query: deferredQuery, openOnly, transportOnly, curriculum }), [all, deferredQuery, openOnly, transportOnly, curriculum]);
  const filtered = !!(query || openOnly || transportOnly || curriculum);
  const contentWidth = Math.min(width, MAX_WIDTH);
  const columns = contentWidth >= 1080 ? 3 : contentWidth >= 700 ? 2 : 1;
  const sidePad = Math.max(spacing.lg, (width - MAX_WIDTH) / 2 + spacing.lg);

  const clearFilters = () => {
    setQuery('');
    setOpenOnly(false);
    setTransportOnly(false);
    setCurriculum(null);
  };

  const toggleLanguage = async () => {
    const next = currentLanguage() === 'ar' ? 'en' : 'ar';
    const restart = await setAppLanguage(next);
    if (restart) toast.info(t('common.restartRequired'));
  };

  const header = (
    <View style={{ paddingTop: spacing.sm }}>
      <Gradient stops={[shade(colors.primary, 8), colors.primary, shade(colors.primary, -32)]} angle={125} style={[styles.hero, { borderRadius: radius.xl + 4 }]}>
        <View style={[styles.bubble, { width: 220, height: 220, top: -90, end: -60 }]} />
        <View style={[styles.bubble, { width: 140, height: 140, bottom: -70, start: -30 }]} />
        <Text variant="display" style={styles.heroTitle}>
          {t('landing.heroTitle')}
        </Text>
        <Text style={styles.heroSubtitle}>{t('landing.heroSubtitle')}</Text>
        <View style={[styles.search, { backgroundColor: colors.surface, borderRadius: radius.pill }]}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('landing.searchPlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text, textAlign: currentLanguage() === 'ar' ? 'right' : 'left' }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t('landing.searchPlaceholder')}
            testID="directory-search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} hitSlop={10} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </Gradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('landing.all')} selected={!filtered} onPress={clearFilters} />
        <Chip label={t('landing.openOnly')} icon="checkmark-circle-outline" tone="success" selected={openOnly} onPress={() => setOpenOnly((v) => !v)} />
        <Chip label={t('landing.transportOnly')} icon="bus-outline" selected={transportOnly} onPress={() => setTransportOnly((v) => !v)} />
        {curricula.map((c) => (
          <Chip key={c} label={c} tone="neutral" selected={curriculum === c} onPress={() => setCurriculum((cur) => (cur === c ? null : c))} />
        ))}
      </ScrollView>

      <View style={styles.countRow}>
        <Text variant="captionStrong" color="textMuted">
          {schools.data ? t('landing.resultsCount', { count: rows.length }) : ' '}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/application-status' as never)} hitSlop={8}>
          <Text variant="captionStrong" color="primary">
            {t('landing.checkApplication')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const empty = schools.isLoading ? (
    <View style={{ gap: spacing.lg }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.skeletonCard, { borderRadius: radius.xl, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Skeleton height={128} radius={0} />
          <View style={{ padding: spacing.lg, gap: 10 }}>
            <Skeleton width={56} height={56} radius={16} style={{ marginTop: -40 }} />
            <Skeleton width="70%" height={18} />
            <Skeleton width="45%" height={14} />
          </View>
        </View>
      ))}
    </View>
  ) : schools.isError && !schools.data ? (
    <ErrorState message={t('landing.loadError')} onRetry={() => void schools.refetch()} retryLabel={t('common.retry')} />
  ) : filtered ? (
    <EmptyState icon="search-outline" title={t('landing.emptyTitle')} body={t('landing.emptyBody')} actionLabel={t('landing.clearFilters')} onAction={clearFilters} />
  ) : (
    <EmptyState icon="school-outline" title={t('landing.emptyDirectoryTitle')} body={t('landing.emptyDirectoryBody')} actionLabel={t('landing.createSchool')} onAction={() => router.push('/(auth)/sign-up' as never)} />
  );

  const open = (s: School) => {
    haptic('selection');
    router.push(`/schools/${s.schoolId}` as never);
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* Top bar: brand · language · Sign in */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, paddingHorizontal: sidePad, backgroundColor: colors.background }]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Ionicons name="bus" size={20} color={colors.onPrimary} />
        </View>
        <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
          {t('landing.brand')}
        </Text>
        <Pressable accessibilityRole="button" onPress={toggleLanguage} hitSlop={8} style={[styles.langPill, { borderColor: colors.border }]}>
          <Text variant="captionStrong">{currentLanguage() === 'ar' ? 'EN' : 'ع'}</Text>
        </Pressable>
        <Button size="sm" variant="outline" icon="log-in-outline" title={t('landing.signIn')} onPress={() => router.push('/(auth)/sign-in' as never)} testID="landing-sign-in" />
      </View>

      <FlashList
        key={`cols-${columns}`}
        data={rows}
        numColumns={columns}
        keyExtractor={(s) => s.schoolId}
        renderItem={({ item }) => (
          <View style={{ padding: spacing.sm }}>
            <SchoolCard school={item} onPress={() => open(item)} />
          </View>
        )}
        ListHeaderComponent={<View style={{ paddingHorizontal: spacing.sm }}>{header}</View>}
        ListEmptyComponent={<View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.md }}>{empty}</View>}
        contentContainerStyle={{ paddingHorizontal: sidePad - spacing.sm, paddingBottom: 150 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={schools.isRefetching && !schools.isLoading} onRefresh={() => void schools.refetch()} tintColor={colors.primary} />}
      />

      {/* Create-my-school call to action, always reachable */}
      <View pointerEvents="box-none" style={[styles.ctaWrap, { paddingBottom: insets.bottom + spacing.md, paddingHorizontal: sidePad }]}>
        <Gradient stops={[{ color: colors.background, opacity: 0 }, { color: colors.background, opacity: 1 }]} angle={180} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={[styles.cta, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }, theme.shadow.sheet]}>
          <View style={[styles.ctaIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="business" size={22} color={colors.primary} />
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={3} style={{ flex: 1 }}>
            {t('landing.runSchool')}
          </Text>
          <Button title={t('landing.createSchool')} icon="add-circle-outline" onPress={() => router.push('/(auth)/sign-up' as never)} testID="landing-create-school" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, zIndex: 2 },
  brandMark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  langPill: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  hero: { overflow: 'hidden', padding: 22, gap: 10, marginHorizontal: 8 },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)' },
  heroTitle: { color: '#FFFFFF' },
  heroSubtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 21 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 52, marginTop: 8 },
  searchInput: { flex: 1, fontSize: 16, height: '100%', ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },
  chips: { gap: 8, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 4 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  skeletonCard: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  ctaWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  ctaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

