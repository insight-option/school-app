import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { Badge, Chip, EmptyState, ListItem, Screen, Sheet, SkeletonList, Text, useTheme } from '../../ui';
import { useAuditLog } from '../../features/ops';
import { parseJson, type AuditLog } from '../../lib/data/client';
import { formatDateTime } from '../../lib/util/format';

const ACTIONS = ['CREATE_STUDENT', 'CREATE_TEACHER', 'CREATE_BUS', 'ASSIGN_STUDENT', 'ASSIGN_TEACHER', 'RESET_PASSWORD', 'DISABLE_USER', 'ENABLE_USER', 'DELETE_USER', 'START_TRIP', 'END_TRIP', 'UPDATE_HOME_LOCATION', 'SUBMIT_FEEDBACK', 'SEND_BROADCAST', 'BULK_IMPORT', 'REQUEST_DATA_DELETION'];
const ENTITIES = ['Profile', 'Bus', 'Trip', 'Feedback', 'Broadcast', 'ImportJob'];

export default function AdminAudit() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [action, setAction] = useState<string | undefined>();
  const [entity, setEntity] = useState<string | undefined>();
  const q = useAuditLog(true, { action, entityType: entity });
  const [open, setOpen] = useState<AuditLog | null>(null);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <Screen padded={false} title={t('admin.audit')}>
      <View style={{ paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg }}>
          <Chip label={`${t('admin.filterAction')}: ${t('common.all')}`} selected={!action} onPress={() => setAction(undefined)} />
          {ACTIONS.map((a) => (
            <Chip key={a} label={a} selected={action === a} onPress={() => setAction(a)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg }}>
          <Chip label={`${t('admin.filterEntity')}: ${t('common.all')}`} selected={!entity} onPress={() => setEntity(undefined)} tone="neutral" />
          {ENTITIES.map((e) => (
            <Chip key={e} label={e} selected={entity === e} onPress={() => setEntity(e)} tone="neutral" />
          ))}
        </ScrollView>
      </View>
      {q.isLoading && !items.length ? (
        <SkeletonList avatar={false} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(a) => a.id}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="document-text-outline" title={t('admin.auditEmpty')} compact />}
          renderItem={({ item }) => (
            <ListItem title={item.action} subtitle={`${item.actorName ?? item.actorId} → ${item.entityType} ${item.entityId.slice(0, 12)}`} meta={formatDateTime(item.occurredAt)} right={<Badge label={item.entityType} size="sm" />} onPress={() => setOpen(item)} />
          )}
        />
      )}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.action}>
        {open ? (
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="textMuted">
              {formatDateTime(open.occurredAt)} · {open.actorName ?? open.actorId}
            </Text>
            <Text variant="captionStrong">
              {open.entityType} · {open.entityId}
            </Text>
            {open.before ? (
              <>
                <Text variant="label" color="textMuted">
                  BEFORE
                </Text>
                <Text variant="caption" selectable>
                  {JSON.stringify(parseJson(open.before) ?? open.before, null, 2)}
                </Text>
              </>
            ) : null}
            {open.after ? (
              <>
                <Text variant="label" color="textMuted">
                  AFTER
                </Text>
                <Text variant="caption" selectable>
                  {JSON.stringify(parseJson(open.after) ?? open.after, null, 2)}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
