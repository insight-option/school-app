import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Avatar, Badge, Button, ConfirmSheet, EmptyState, Input, KeyValue, ListItem, Screen, Sheet, SkeletonList, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { useOwnerUserAction, useOwnerUsers, type PlatformUser, type UserAction } from '../../features/owner';
import { formatDate } from '../../lib/util/format';

const GROUP_ORDER = ['OWNER', 'ADMIN', 'PARTNER', 'TEACHER', 'DRIVER', 'STUDENT', 'CUSTOMER'];
const roleGroups = (u: PlatformUser) => (u.groups ?? []).filter((g): g is string => !!g && GROUP_ORDER.includes(g)).sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));

/** Every Cognito account: search, disable / enable, reset password, delete. */
export default function OwnerUsers() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [open, setOpen] = useState<PlatformUser | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setApplied(query.trim()), 400);
    return () => clearTimeout(id);
  }, [query]);
  const q = useOwnerUsers(applied);
  const users = useMemo(() => q.data?.pages.flatMap((p) => p.users) ?? [], [q.data]);

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: 6 }}>
      <Input placeholder={t('owner.users.search')} value={query} onChangeText={setQuery} leftIcon="search" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => setApplied(query.trim())} />
      <Text variant="caption" color="textFaint">
        {t('owner.users.searchHint')}
      </Text>
    </View>
  );

  return (
    <Screen back={width < 900} padded={false} title={t('owner.users.title')} subtitle={t('owner.users.subtitle')} maxWidth={1000}>
      {q.isLoading && !q.data ? (
        <>
          {header}
          <SkeletonList rows={8} />
        </>
      ) : (
        <FlashList
          data={users}
          keyExtractor={(u) => u.username}
          ListHeaderComponent={header}
          renderItem={({ item }) => <UserRow user={item} onPress={() => setOpen(item)} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title={t('owner.users.empty')} compact />}
          ListFooterComponent={
            q.hasNextPage ? (
              <View style={{ padding: theme.spacing.lg }}>
                <Button title={t('owner.users.loadMore')} variant="outline" onPress={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} fullWidth />
              </View>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        />
      )}
      {open ? <UserSheet user={users.find((u) => u.username === open.username) ?? open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

const UserRow = React.memo(function UserRow({ user: u, onPress }: { user: PlatformUser; onPress: () => void }) {
  const { t } = useTranslation();
  const groups = roleGroups(u);
  return (
    <ListItem
      title={u.name || u.email || u.username}
      subtitle={[u.email && u.email !== u.name ? u.email : null, u.username !== u.email ? u.username : null].filter(Boolean).join(' · ') || undefined}
      left={<Avatar name={u.name || u.username} size={44} />}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {groups[0] ? <Badge label={t(`owner.users.group.${groups[0]}`)} tone={groups[0] === 'OWNER' ? 'accent' : 'primary'} size="sm" /> : null}
          {u.enabled === false ? <Badge label={t('owner.users.disabled')} tone="danger" size="sm" /> : u.status === 'UNCONFIRMED' ? <Badge label={t('owner.users.unconfirmed')} tone="warning" size="sm" /> : null}
        </View>
      }
      onPress={onPress}
    />
  );
});

function UserSheet({ user: u, onClose }: { user: PlatformUser; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const action = useOwnerUserAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const groups = roleGroups(u);
  const isOwner = groups.includes('OWNER');
  const run = (a: UserAction, msg: string) =>
    action.mutate(
      { username: u.username, action: a },
      {
        onSuccess: () => {
          toast.success(msg);
          setConfirmDelete(false);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  const statusText = u.enabled === false ? t('owner.users.disabled') : u.status === 'UNCONFIRMED' ? t('owner.users.unconfirmed') : u.status === 'FORCE_CHANGE_PASSWORD' ? t('owner.users.forceChange') : t('owner.users.enabled');

  return (
    <>
      <Sheet visible={!confirmDelete} onClose={onClose} title={u.name || u.username}>
        <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {groups.map((g) => (
              <Badge key={g} label={t(`owner.users.group.${g}`)} tone={g === 'OWNER' ? 'accent' : 'primary'} size="sm" />
            ))}
          </View>
          <KeyValue label={t('common.id')} value={u.username} />
          {u.email ? <KeyValue label={t('common.email')} value={u.email} /> : null}
          <KeyValue label={t('common.status')} value={statusText} />
          {u.schoolId ? <KeyValue label={t('owner.users.tenant', { id: '' }).trim()} value={u.schoolId} /> : null}
          {u.createdAt ? <KeyValue label={t('owner.users.joined', { date: '' }).trim()} value={formatDate(u.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} /> : null}
          {!isOwner ? (
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {u.enabled === false ? (
                <Button title={t('owner.users.enable')} icon="lock-open-outline" variant="success" onPress={() => run('ENABLE', t('owner.users.done'))} loading={action.isPending} fullWidth />
              ) : (
                <Button title={t('owner.users.disable')} icon="lock-closed-outline" variant="outline" onPress={() => run('DISABLE', t('owner.users.done'))} loading={action.isPending} fullWidth />
              )}
              {u.email ? <Button title={t('owner.users.resetPassword')} icon="key-outline" variant="outline" onPress={() => run('RESET_PASSWORD', t('owner.users.resetSent'))} disabled={action.isPending} fullWidth /> : null}
              <Button title={t('owner.users.delete')} icon="trash-outline" variant="danger" onPress={() => setConfirmDelete(true)} disabled={action.isPending} fullWidth />
            </View>
          ) : null}
        </View>
      </Sheet>
      <ConfirmSheet
        visible={confirmDelete}
        title={t('owner.users.deleteTitle', { name: u.name || u.username })}
        body={t('owner.users.deleteBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={action.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => run('DELETE', t('owner.users.done'))}
      />
    </>
  );
}
