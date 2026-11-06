import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, ConfirmSheet, EmptyState, IconButton, Input, Screen, Sheet, SkeletonList, SwitchRow, Text, useTheme, withAlpha } from '../../ui';
import { toast } from '../../ui/Toast';
import { categoryName, useCategories } from '../../features/platform';
import { useDeleteCategory, useReorderCategories, useSaveCategory, useSeedCategories } from '../../features/owner';
import type { Category } from '../../lib/data/client';
import { ColorField, isHexColor } from '../../components/owner/kit';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: IconName[] = [
  'football', 'basketball', 'tennisball', 'tennisball-outline', 'baseball', 'golf', 'bicycle', 'barbell', 'fitness', 'body', 'water', 'boat',
  'snow', 'walk', 'trophy', 'medal', 'ribbon', 'school', 'library', 'book', 'easel', 'color-palette', 'musical-notes', 'mic',
  'camera', 'game-controller', 'happy', 'people', 'sparkles', 'star', 'restaurant', 'cafe', 'car', 'airplane', 'paw', 'leaf',
  'flower', 'home', 'business', 'storefront', 'grid', 'ellipsis-horizontal',
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Explore categories: order, visibility, names, icon and colour. */
export default function OwnerCategories() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const seed = useSeedCategories();
  const reorder = useReorderCategories();
  const save = useSaveCategory();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const rows = categories.data ?? [];
  const arabic = i18n.language === 'ar';

  const move = (index: number, dir: -1 | 1) => {
    const a = rows[index];
    const b = rows[index + dir];
    if (!a || !b) return;
    // Normalise to positions so equal / missing `order` values still swap cleanly.
    reorder.mutate(
      [
        { id: a.id, order: index + dir + 1 },
        { id: b.id, order: index + 1 },
      ],
      { onError: (e) => toast.error(e.message) },
    );
  };

  const addDefaults = () =>
    seed.mutate(rows, {
      onSuccess: (n) => (n ? toast.success(t('owner.categories.defaultsAdded', { count: n })) : toast.info(t('owner.categories.defaultsNone'))),
      onError: (e) => toast.error(e.message),
    });

  return (
    <Screen
      back={width < 900}
      title={t('owner.categories.title')}
      subtitle={t('owner.categories.subtitle')}
      right={<Button title={t('owner.categories.add')} icon="add" size="sm" onPress={() => setEditing('new')} />}
      scroll
      maxWidth={900}
      refreshing={categories.isRefetching}
      onRefresh={() => void categories.refetch()}
    >
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <Button title={t('owner.categories.addDefaults')} icon="sparkles-outline" variant="secondary" onPress={addDefaults} loading={seed.isPending} style={{ alignSelf: 'flex-start' }} />
        {categories.isLoading && !rows.length ? (
          <SkeletonList rows={6} />
        ) : rows.length ? (
          <Card padding={0}>
            {rows.map((c, i) => {
              const color = isHexColor(c.color) ? c.color! : theme.colors.primary;
              return (
                <View key={c.id} style={[styles.row, { borderBottomColor: theme.colors.border, borderBottomWidth: i === rows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                  <Pressable accessibilityRole="button" onPress={() => setEditing(c)} style={styles.main}>
                    <View style={[styles.tile, { backgroundColor: withAlpha(color, 0.14) }]}>
                      <Ionicons name={(c.icon as IconName) || 'grid'} size={22} color={color} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {categoryName(c, arabic)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <Badge label={c.kind === 'SCHOOL' ? t('owner.categories.kindSCHOOL') : t('owner.categories.kindACTIVITY')} size="sm" />
                        {c.active === false ? <Badge label={t('owner.categories.hidden')} tone="warning" size="sm" /> : null}
                      </View>
                    </View>
                  </Pressable>
                  <IconButton icon="chevron-up" label={t('owner.categories.moveUp')} size={36} disabled={i === 0 || reorder.isPending} onPress={() => move(i, -1)} />
                  <IconButton icon="chevron-down" label={t('owner.categories.moveDown')} size={36} disabled={i === rows.length - 1 || reorder.isPending} onPress={() => move(i, 1)} />
                  <Switch
                    value={c.active !== false}
                    onValueChange={(v) => save.mutate({ ...stripMeta(c), active: v }, { onError: (e) => toast.error(e.message) })}
                    trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                    thumbColor="#fff"
                  />
                </View>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon="pricetags-outline" title={t('owner.categories.empty')} body={t('owner.categories.emptyBody')} actionLabel={t('owner.categories.addDefaults')} onAction={addDefaults} />
        )}
      </View>
      {editing ? <CategorySheet category={editing === 'new' ? null : editing} nextOrder={rows.length + 1} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function stripMeta(c: Category) {
  return {
    id: c.id,
    slug: c.slug,
    kind: c.kind,
    nameEn: c.nameEn,
    nameAr: c.nameAr ?? null,
    descriptionEn: c.descriptionEn ?? null,
    descriptionAr: c.descriptionAr ?? null,
    icon: c.icon ?? null,
    color: c.color ?? null,
    imageKey: c.imageKey ?? null,
    order: c.order ?? null,
    active: c.active ?? true,
  };
}

function CategorySheet({ category, nextOrder, onClose }: { category: Category | null; nextOrder: number; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const save = useSaveCategory();
  const del = useDeleteCategory();
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState(() => ({
    nameEn: category?.nameEn ?? '',
    nameAr: category?.nameAr ?? '',
    slug: category?.slug ?? '',
    kind: (category?.kind === 'SCHOOL' ? 'SCHOOL' : 'ACTIVITY') as 'SCHOOL' | 'ACTIVITY',
    icon: (category?.icon as IconName) || 'grid',
    color: category?.color ?? '#8A1538',
    descriptionEn: category?.descriptionEn ?? '',
    descriptionAr: category?.descriptionAr ?? '',
    active: category?.active !== false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.nameEn.trim()) e.nameEn = t('owner.categories.errorName');
    if (!isHexColor(form.color)) e.color = t('owner.branding.invalidHex');
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {
        ...(category ? stripMeta(category) : { order: nextOrder, imageKey: null }),
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim() || null,
        slug: slugify(form.slug || form.nameEn) || `cat-${Date.now().toString(36)}`,
        kind: form.kind,
        icon: form.icon,
        color: form.color,
        descriptionEn: form.descriptionEn.trim() || null,
        descriptionAr: form.descriptionAr.trim() || null,
        active: form.active,
      },
      {
        onSuccess: () => {
          toast.success(t('owner.categories.saved'));
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <>
      <Sheet
        visible={!confirm}
        onClose={onClose}
        title={category ? t('owner.categories.edit') : t('owner.categories.add')}
        footer={<Button title={t('common.save')} onPress={submit} loading={save.isPending} fullWidth size="lg" />}
      >
        <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.preview, { backgroundColor: withAlpha(isHexColor(form.color) ? form.color : theme.colors.primary, 0.14) }]}>
              <Ionicons name={form.icon} size={30} color={isHexColor(form.color) ? form.color : theme.colors.primary} />
            </View>
            <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
              {form.nameEn || t('owner.categories.add')}
            </Text>
          </View>
          <Input label={t('owner.categories.nameEn')} value={form.nameEn} onChangeText={(v) => set('nameEn', v)} required error={errors.nameEn} />
          <Input label={t('owner.categories.nameAr')} value={form.nameAr} onChangeText={(v) => set('nameAr', v)} />
          <Input label={t('owner.categories.slug')} value={form.slug} onChangeText={(v) => set('slug', v)} placeholder={slugify(form.nameEn) || 'padel'} autoCapitalize="none" autoCorrect={false} />
          <View style={{ gap: 8 }}>
            <Text variant="captionStrong" color="textMuted">
              {t('owner.categories.kind')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={t('owner.categories.kindACTIVITY')} selected={form.kind === 'ACTIVITY'} onPress={() => set('kind', 'ACTIVITY')} />
              <Chip label={t('owner.categories.kindSCHOOL')} selected={form.kind === 'SCHOOL'} onPress={() => set('kind', 'SCHOOL')} />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="captionStrong" color="textMuted">
              {t('owner.categories.icon')}
            </Text>
            <View style={styles.iconGrid}>
              {ICONS.map((name) => {
                const active = form.icon === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    accessibilityState={{ selected: active }}
                    onPress={() => set('icon', name)}
                    style={[styles.iconCell, { borderRadius: theme.radius.md, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceAlt, borderColor: active ? theme.colors.primary : 'transparent' }]}
                  >
                    <Ionicons name={name} size={22} color={active ? theme.colors.primary : theme.colors.text} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <ColorField label={t('owner.categories.color')} value={form.color} onChange={(v) => set('color', v)} error={errors.color} />
          <Input label={t('owner.categories.descriptionEn')} value={form.descriptionEn} onChangeText={(v) => set('descriptionEn', v)} multiline />
          <Input label={t('owner.categories.descriptionAr')} value={form.descriptionAr} onChangeText={(v) => set('descriptionAr', v)} multiline />
          <SwitchRow label={t('owner.categories.active')} value={form.active} onValueChange={(v) => set('active', v)} />
          {category ? <Button title={t('owner.categories.delete')} icon="trash-outline" variant="ghost" onPress={() => setConfirm(true)} /> : null}
        </View>
      </Sheet>
      {category ? (
        <ConfirmSheet
          visible={confirm}
          title={t('owner.categories.deleteTitle', { name: category.nameEn })}
          body={t('owner.categories.deleteBody')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={del.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            del.mutate(category.id, {
              onSuccess: () => {
                toast.success(t('owner.categories.deleted'));
                onClose();
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  preview: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconCell: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
