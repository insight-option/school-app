import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Skeleton, Text, useTheme } from '../../../ui';
import { SchoolCover, schoolAccent } from '../../../components/directory/SchoolCard';
import { SchoolLogo } from '../../../components/media/StorageImage';
import { MapView } from '../../../components/map/MapView';
import { cleanList, useSchool } from '../../../features/directory';
import { acceptsApplications, feeRange, locationLine, websiteUrl } from '../../../lib/directory';
import { formatDate } from '../../../lib/util/format';
import { callPhone } from '../../../lib/util/device';

const COVER = 250;
const MAX_WIDTH = 860;

export default function SchoolScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const q = useSchool(schoolId ? String(schoolId) : null);
  const school = q.data;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const backButton = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back} style={[styles.round, { top: insets.top + 8, start: 16 }]} hitSlop={8}>
      <Ionicons name="arrow-back" size={22} color="#fff" />
    </Pressable>
  );

  if (!school) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        {q.isLoading ? (
          <View>
            <Skeleton height={COVER} radius={0} />
            <View style={{ padding: spacing.lg, gap: 12 }}>
              <Skeleton width={72} height={72} radius={20} style={{ marginTop: -56 }} />
              <Skeleton width="65%" height={24} />
              <Skeleton width="40%" height={16} />
              <Skeleton height={120} />
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl }}>
            <EmptyState icon="school-outline" title={t('schoolPage.notFound')} actionLabel={t('schoolPage.backToSchools')} onAction={() => router.replace('/')} />
          </View>
        )}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {backButton}
        </View>
      </View>
    );
  }

  const open = acceptsApplications(school);
  const accent = schoolAccent(school);
  const fees = feeRange(school, i18n.language);
  const place = locationLine(school);
  const site = websiteUrl(school.website);
  const documents = cleanList(school.requiredDocuments);
  const facilities = cleanList(school.facilities);
  const directions = () => {
    if (!school.location) return;
    const { lat, lng } = school.location;
    const url = Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    void Linking.openURL(url);
  };

  type Fact = { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null };
  const allFacts: Fact[] = [
    { icon: 'book-outline', label: t('schoolPage.curriculum'), value: school.curriculum },
    { icon: 'layers-outline', label: t('schoolPage.grades'), value: school.grades },
    { icon: 'language-outline', label: t('schoolPage.languages'), value: school.languages },
    { icon: 'people-outline', label: t('schoolPage.students'), value: school.genderPolicy ? t(`schoolPage.genders.${school.genderPolicy}`) : null },
    { icon: 'cash-outline', label: t('schoolPage.fees'), value: fees },
    { icon: 'bus-outline', label: t('schoolPage.transport'), value: school.transportAvailable == null ? null : school.transportAvailable ? t('schoolPage.transportYes') : t('schoolPage.transportNo') },
    { icon: 'calendar-outline', label: t('schoolPage.founded'), value: school.foundedYear ? String(school.foundedYear) : null },
    { icon: 'person-add-outline', label: t('schoolPage.seats'), value: school.seatsAvailable != null ? String(school.seatsAvailable) : null },
  ];
  const facts = allFacts.filter((f) => !!f.value);
  const tileWidth = width >= 640 ? '31%' : '47%';

  const quick: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [];
  if (school.phone) quick.push({ icon: 'call', label: t('schoolPage.call'), onPress: () => void callPhone(school.phone) });
  if (school.email) quick.push({ icon: 'mail', label: t('schoolPage.email'), onPress: () => void Linking.openURL(`mailto:${school.email}`) });
  if (site) quick.push({ icon: 'globe', label: t('schoolPage.website'), onPress: () => void Linking.openURL(site) });
  if (school.location) quick.push({ icon: 'navigate', label: t('schoolPage.directions'), onPress: directions });

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <SchoolCover school={school} height={COVER + insets.top} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: radius.xl + 6, borderTopRightRadius: radius.xl + 6, maxWidth: MAX_WIDTH }]}>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SchoolLogo logoKey={school.logoKey} name={school.name} color={school.primaryColor} size={84} bordered style={[{ marginTop: -60 }, theme.shadow.card]} />
            <Text variant="title" style={{ marginTop: spacing.md }}>
              {school.name}
            </Text>
            {school.tagline ? (
              <Text color="textMuted" style={{ marginTop: 4 }}>
                {school.tagline}
              </Text>
            ) : null}
            <View style={[styles.row, { marginTop: spacing.md, flexWrap: 'wrap' }]}>
              {place ? <Pill icon="location" label={place} color={colors.textMuted} bg={colors.surfaceAlt} /> : null}
              <Pill icon={open ? 'checkmark-circle' : 'time-outline'} label={open ? t('landing.open') : t('landing.closed')} color={open ? colors.success : colors.textMuted} bg={open ? colors.successSoft : colors.surfaceAlt} />
              {school.transportAvailable ? <Pill icon="bus" label={t('landing.transport')} color={accent} bg={colors.primarySoft} /> : null}
            </View>

            {quick.length ? (
              <View style={[styles.quickRow, { marginTop: spacing.xl }]}>
                {quick.map((a) => (
                  <Pressable key={a.label} accessibilityRole="button" onPress={a.onPress} style={({ pressed }) => [styles.quick, { opacity: pressed ? 0.7 : 1 }]}>
                    <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name={a.icon} size={20} color={colors.primary} />
                    </View>
                    <Text variant="captionStrong">{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, marginTop: spacing.xl }}>
            {school.description ? (
              <Section title={t('schoolPage.about')}>
                <Text style={{ lineHeight: 24 }}>{school.description}</Text>
              </Section>
            ) : null}

            {facts.length ? (
              <Section title={t('schoolPage.atAGlance')}>
                <View style={styles.grid}>
                  {facts.map((f) => (
                    <View key={f.label} style={[styles.fact, { width: tileWidth, backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
                      <Ionicons name={f.icon} size={18} color={accent} />
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {f.label}
                      </Text>
                      <Text variant="bodyStrong" numberOfLines={2}>
                        {f.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            <Section title={t('schoolPage.admissions')}>
              <View style={[styles.row, { gap: 10 }]}>
                <Ionicons name={open ? 'checkmark-circle' : 'information-circle'} size={22} color={open ? colors.success : colors.textMuted} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {open ? (school.applicationDeadline ? t('schoolPage.openUntil', { date: formatDate(school.applicationDeadline) }) : t('schoolPage.openNow')) : t('schoolPage.closedNow')}
                </Text>
              </View>
              {school.academicYear ? <Info label={t('schoolPage.academicYear')} value={school.academicYear} /> : null}
              {school.admissionsNote ? <Text color="textMuted">{school.admissionsNote}</Text> : null}
              {documents.length ? (
                <View style={{ gap: 6 }}>
                  <Text variant="captionStrong" color="textMuted">
                    {t('schoolPage.documents')}
                  </Text>
                  {documents.map((d) => (
                    <View key={d} style={styles.row}>
                      <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
                      <Text style={{ flex: 1 }}>{d}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/application-status', params: {} } as never)} hitSlop={6}>
                <Text variant="captionStrong" color="primary">
                  {t('schoolPage.checkStatus')}
                </Text>
              </Pressable>
            </Section>

            {facilities.length ? (
              <Section title={t('schoolPage.facilities')}>
                <View style={[styles.row, { flexWrap: 'wrap' }]}>
                  {facilities.map((f) => (
                    <View key={f} style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
                      <Text variant="captionStrong">{f}</Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            {school.location ? (
              <Section title={t('schoolPage.location')}>
                <Pressable accessibilityRole="button" onPress={directions} style={[styles.map, { borderRadius: radius.lg }]}>
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <MapView
                      markers={[{ id: 'school', kind: 'school', lat: school.location.lat, lng: school.location.lng, color: accent }]}
                      initialRegion={{ lat: school.location.lat, lng: school.location.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
                    />
                  </View>
                </Pressable>
                {school.address ? <Text color="textMuted">{school.address}</Text> : null}
              </Section>
            ) : null}

            {school.phone || school.email || site ? (
              <Section title={t('schoolPage.contact')}>
                {school.phone ? <Info label={t('schoolPage.call')} value={school.phone} /> : null}
                {school.email ? <Info label={t('schoolPage.email')} value={school.email} /> : null}
                {site ? <Info label={t('schoolPage.website')} value={school.website ?? site} /> : null}
              </Section>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {backButton}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }, theme.shadow.sheet]}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {school.name}
          </Text>
          <Text variant="caption" color={open ? 'success' : 'textMuted'} numberOfLines={1}>
            {open ? (school.applicationDeadline ? t('landing.applyBy', { date: formatDate(school.applicationDeadline) }) : t('landing.open')) : t('landing.closed')}
          </Text>
        </View>
        <Button
          title={open ? t('schoolPage.apply') : t('schoolPage.applicationsClosed')}
          icon={open ? 'create-outline' : 'lock-closed-outline'}
          size="lg"
          disabled={!open}
          onPress={() => router.push(`/schools/${school.schoolId}/apply` as never)}
          testID="school-apply"
        />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="subheading">{title}</Text>
      {children}
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="bodyStrong" selectable>
        {value}
      </Text>
    </View>
  );
}

function Pill({ icon, label, color, bg }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text variant="captionStrong" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  fill: { flex: 1 },
  round: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  sheet: { marginTop: -28, paddingTop: 4, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: '100%' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around' },
  quick: { alignItems: 'center', gap: 6, minWidth: 64 },
  quickIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { padding: 12, gap: 4, flexGrow: 1 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  map: { height: 180, overflow: 'hidden' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
