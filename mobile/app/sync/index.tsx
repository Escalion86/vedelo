import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import {
  formatConflictValue,
  getConflictEntityLabel,
  getConflictFieldLabel,
} from '../../src/shared/domain/conflictPresentation'
import {
  getFileStatusPresentation,
  getOutboxMethodLabel,
  getOutboxStatusPresentation,
  getQueueEntityTitle,
  getSafeSyncErrorMessage,
} from '../../src/shared/domain/syncQueuePresentation'
import { getSyncStatePresentation } from '../../src/shared/domain/syncStatePresentation'
import type {
  Client,
  Event,
  Service,
  ServiceGroup,
  Transaction,
} from '../../src/shared/domain/types'
import { listCachedEntities } from '../../src/shared/storage/cache'
import {
  getOutboxSummary,
  listOutboxDisplayItems,
  retryOutboxOperationNow,
  type OutboxDisplayItem,
} from '../../src/shared/storage/outbox'
import {
  listFileQueueDisplayItems,
  retryFileQueueNow,
  type FileQueueDisplayItem,
} from '../../src/shared/storage/encryptedFiles'
import {
  getLocalDatabaseDiagnostics,
  type LocalDatabaseDiagnostics,
} from '../../src/shared/storage/databaseDiagnostics'
import {
  listConflicts,
  resolveConflict,
  type SyncConflict,
} from '../../src/shared/storage/conflicts'
import { runSync } from '../../src/shared/sync/syncEngine'
import { useSyncRunState } from '../../src/shared/hooks/useSyncRunState'
import {
  getBackgroundSyncInfo,
  type BackgroundSyncInfo,
} from '../../src/shared/sync/backgroundSync'
import {
  Button,
  EmptyState,
  Notice,
  PageHeader,
  Screen,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../src/shared/ui/components'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../src/shared/ui/theme'

export default function SyncScreen() {
  const styles = useThemeStyles(createStyles)
  const queryClient = useQueryClient()
  const syncRunState = useSyncRunState()
  const syncRunPresentation = getSyncStatePresentation(syncRunState)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [labelsById, setLabelsById] = useState<Record<string, string>>({})
  const [labelsByEntity, setLabelsByEntity] = useState<Record<string, string>>(
    {}
  )
  const [backgroundInfo, setBackgroundInfo] =
    useState<BackgroundSyncInfo | null>(null)
  const [databaseDiagnostics, setDatabaseDiagnostics] =
    useState<LocalDatabaseDiagnostics | null>(null)
  const [outboxItems, setOutboxItems] = useState<OutboxDisplayItem[]>([])
  const [fileItems, setFileItems] = useState<FileQueueDisplayItem[]>([])
  const [error, setError] = useState('')
  const [retryingId, setRetryingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [readState, setReadState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const readLocalState = async () => {
    const [
      items,
      counts,
      clients,
      services,
      events,
      transactions,
      serviceGroups,
      background,
      diagnostics,
      queuedOperations,
      queuedFiles,
    ] = await Promise.all([
      listConflicts(),
      getOutboxSummary(),
      listCachedEntities<Client>('clients'),
      listCachedEntities<Service>('services'),
      listCachedEntities<Event>('events'),
      listCachedEntities<Transaction>('transactions'),
      listCachedEntities<ServiceGroup>('serviceGroups'),
      getBackgroundSyncInfo().catch(() => null),
      getLocalDatabaseDiagnostics().catch(() => null),
      listOutboxDisplayItems(),
      listFileQueueDisplayItems(),
    ])
    setConflicts(items)
    setSummary(counts)
    setBackgroundInfo(background)
    setDatabaseDiagnostics(diagnostics)
    setOutboxItems(queuedOperations)
    setFileItems(queuedFiles)
    setLabelsById(
      Object.fromEntries([
        ...clients.map((client) => [
          client._id,
          [client.firstName, client.secondName].filter(Boolean).join(' ') ||
            client.phone ||
            'Клиент',
        ]),
        ...services.map((service) => [service._id, service.title || 'Услуга']),
      ])
    )
    setLabelsByEntity(
      Object.fromEntries([
        ...clients.map((client) => [
          `clients:${client._id}`,
          [client.firstName, client.secondName].filter(Boolean).join(' ') ||
            client.phone ||
            'Клиент',
        ]),
        ...services.map((service) => [
          `services:${service._id}`,
          service.title || 'Услуга',
        ]),
        ...events.map((event) => [
          `events:${event._id}`,
          event.eventType || event.description || 'Мероприятие',
        ]),
        ...transactions.map((transaction) => [
          `transactions:${transaction._id}`,
          transaction.comment ||
            `${transaction.type === 'income' ? 'Доход' : 'Расход'} ${Number(transaction.amount || 0).toLocaleString('ru-RU')} ₽`,
        ]),
        ...serviceGroups.map((group) => [
          `serviceGroups:${group._id}`,
          group.title || 'Группа услуг',
        ]),
      ])
    )
  }
  // Presentation only: the existing read and sync operation order stays unchanged.
  const load = async () => {
    setReadState('loading')
    try {
      await readLocalState()
      setReadState('ready')
    } catch (reason) {
      setReadState('unavailable')
      throw reason
    }
  }
  useEffect(() => {
    void load().catch((reason) => {
      setError(
        getSafeSyncErrorMessage(
          reason instanceof Error ? reason.message : 'Ошибка локальной базы'
        )
      )
    })
  }, [])
  const sync = async () => {
    setLoading(true)
    setError('')
    try {
      await runSync({ fullPull: true })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities'] })
      await load()
    } catch (reason) {
      setError(
        getSafeSyncErrorMessage(
          reason instanceof Error ? reason.message : 'Ошибка синхронизации'
        )
      )
    } finally {
      setLoading(false)
    }
  }
  const retryOperation = async (operationId: string) => {
    setRetryingId(`operation:${operationId}`)
    setError('')
    try {
      await retryOutboxOperationNow(operationId)
      await runSync()
      await queryClient.invalidateQueries({ queryKey: ['cached-entities'] })
      await load()
    } catch (reason) {
      setError(
        getSafeSyncErrorMessage(
          reason instanceof Error ? reason.message : 'Ошибка синхронизации'
        )
      )
      await load().catch(() => undefined)
    } finally {
      setRetryingId('')
    }
  }
  const retryFile = async (fileId: string) => {
    setRetryingId(`file:${fileId}`)
    setError('')
    try {
      await retryFileQueueNow({ id: fileId })
      await runSync()
      await load()
    } catch (reason) {
      setError(
        getSafeSyncErrorMessage(
          reason instanceof Error ? reason.message : 'Ошибка отправки файла',
          'file'
        )
      )
      await load().catch(() => undefined)
    } finally {
      setRetryingId('')
    }
  }
  const decide = async (conflict: SyncConflict, choice: 'local' | 'remote') => {
    setRetryingId(`conflict:${conflict.id}:${choice}`)
    setError('')
    try {
      await resolveConflict(conflict, choice)
      await load()
      await queryClient.invalidateQueries({
        queryKey: ['cached-entities', conflict.entityType],
      })
    } catch (reason) {
      setError(
        getSafeSyncErrorMessage(
          reason instanceof Error
            ? reason.message
            : 'Ошибка разрешения конфликта'
        )
      )
      await load().catch(() => undefined)
    } finally {
      setRetryingId('')
    }
  }
  const reading = readState === 'loading'
  const confirmed = readState === 'ready'
  const blocked = Boolean(retryingId) || loading || reading
  return (
    <Screen contentStyle={styles.screen}>
      <PageHeader
        title="Синхронизация"
        subtitle="Очередь и конфликты между устройствами"
      />
      <View style={styles.summary}>
        <Count label="Ожидает" value={confirmed ? summary.pending || 0 : '—'} />
        <Count label="Ошибки" value={confirmed ? summary.failed || 0 : '—'} />
        <Count label="Конфликты" value={confirmed ? summary.conflict || 0 : '—'} />
      </View>
      <Button
        testID="sync-now"
        title="Синхронизировать сейчас"
        onPress={sync}
        loading={loading}
        disabled={Boolean(retryingId) || reading}
      />
      {error ? <Notice tone="danger" message={error} /> : null}
      {reading ? <Notice testID="sync-reading" tone="info" message="Читаем локальную очередь и конфликты…" accessibilityState={{ busy: true }} /> : null}
      {!reading && !confirmed ? <Notice tone="warning" message="Очередь и конфликты не подтверждены. Повторите синхронизацию, чтобы обновить состояние." /> : null}
      <Surface testID="sync-run-state">
        {syncRunState?.status === 'success' && !confirmed ? <Notice tone="info" message="Актуальное состояние очереди ещё не подтверждено." /> : (<>
        <View style={styles.backgroundRow}>
          <View style={styles.flex}>
            <Text style={styles.entity}>{syncRunPresentation.title}</Text>
            <Text style={styles.base}>{syncRunPresentation.description}</Text>
          </View>
          <StatusChip
            label={
              syncRunState?.status === 'success'
                ? 'Актуально'
                : syncRunState?.status === 'pending'
                  ? 'Ожидает отправки'
                  : syncRunState?.status === 'syncing'
                    ? 'Идёт обмен'
                    : syncRunState?.status === 'attention'
                      ? 'Нужно действие'
                      : 'Не завершено'
            }
            tone={syncRunPresentation.tone}
          />
        </View>
        </>)}
      </Surface>
      <Surface>
        <View style={styles.backgroundRow}>
          <View style={styles.flex}>
            <Text style={styles.entity}>Фоновая синхронизация</Text>
            <Text style={styles.base}>
              Android запускает её по возможности; точное время определяет
              система.
            </Text>
          </View>
          <StatusChip
            label={
              !confirmed || !backgroundInfo
                ? reading ? 'Проверяем…' : 'Нет данных'
                : backgroundInfo.registered
                ? 'Включена'
                : backgroundInfo?.available === false
                  ? 'Ограничена системой'
                  : 'Не активна'
            }
            tone={confirmed && backgroundInfo?.registered ? 'success' : 'warning'}
          />
        </View>
      </Surface>
      <Surface testID="sync-database-diagnostics">
        <View style={styles.databaseHeader}>
          <View style={styles.flex}>
            <Text style={styles.entity}>Локальная база</Text>
            <Text style={styles.base}>
              Техническое состояние offline-данных без их содержимого.
            </Text>
          </View>
          <StatusChip
            label={
              !confirmed || !databaseDiagnostics
                ? reading ? 'Проверяем…' : 'Нет данных'
                : databaseDiagnostics.sqlCipherActive
                ? 'SQLCipher активен'
                : 'Нет данных'
            }
            tone={confirmed && databaseDiagnostics?.sqlCipherActive ? 'success' : 'warning'}
          />
        </View>
        {confirmed && databaseDiagnostics ? (
          <View style={styles.databaseDetails}>
            <Text style={styles.base}>
              Схема: v{databaseDiagnostics.schemaVersion} из v
              {databaseDiagnostics.supportedSchemaVersion} · в кэше:{' '}
              {databaseDiagnostics.cachedEntities} · конфликтов:{' '}
              {databaseDiagnostics.conflicts}
            </Text>
            <Text style={styles.base}>
              Операций в очереди:{' '}
              {(databaseDiagnostics.outboxByStatus.pending || 0) +
                (databaseDiagnostics.outboxByStatus.failed || 0) +
                (databaseDiagnostics.outboxByStatus.syncing || 0) +
                (databaseDiagnostics.outboxByStatus.conflict || 0)}{' '}
              · файлов:{' '}
              {(databaseDiagnostics.filesByStatus.pending || 0) +
                (databaseDiagnostics.filesByStatus.failed || 0) +
                (databaseDiagnostics.filesByStatus.uploading || 0)}
            </Text>
            <Text style={styles.base}>
              {databaseDiagnostics.recoveredAtStartup.outboxOperations ||
              databaseDiagnostics.recoveredAtStartup.files
                ? `После прерывания восстановлено: ${databaseDiagnostics.recoveredAtStartup.outboxOperations} операций, ${databaseDiagnostics.recoveredAtStartup.files} файлов`
                : 'Прерванных операций при запуске не найдено.'}
            </Text>
          </View>
        ) : (
          <Notice tone={reading ? 'info' : 'warning'} message={reading ? 'Читаем состояние локальной базы…' : 'Не удалось прочитать состояние локальной базы.'} />
        )}
      </Surface>
      <SectionTitle>Очередь изменений</SectionTitle>
      {!confirmed ? <Notice tone={reading ? 'info' : 'warning'} message={reading ? 'Загружаем очередь…' : 'Данные очереди недоступны.'} /> : outboxItems.length || fileItems.length ? (
        <Surface testID="sync-queue-items">
          {outboxItems.map((item) => {
            const status = getOutboxStatusPresentation(item.status)
            const itemError = getSafeSyncErrorMessage(item.lastError)
            return (
              <View
                key={item.operationId}
                style={styles.queueItem}
                testID={`sync-operation-${item.status}`}
              >
                <View style={styles.queueHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.entity}>
                      {getQueueEntityTitle(
                        item.entityType,
                        item.entityId,
                        labelsByEntity
                      )}
                    </Text>
                    <Text style={styles.base}>
                      {getOutboxMethodLabel(item.method)} ·{' '}
                      {getConflictEntityLabel(item.entityType)}
                    </Text>
                  </View>
                  <StatusChip label={status.label} tone={status.tone} />
                </View>
                {itemError ? (
                  <Notice tone="danger" message={itemError} />
                ) : null}
                {item.status === 'failed' ? (
                  <Button
                    testID="retry-sync-operation"
                    title="Повторить"
                    variant="secondary"
                    loading={retryingId === `operation:${item.operationId}`}
                    disabled={blocked}
                    onPress={() => retryOperation(item.operationId)}
                  />
                ) : item.status === 'conflict' ? (
                  <Text style={styles.base}>
                    Выберите нужную версию в разделе конфликтов ниже.
                  </Text>
                ) : null}
              </View>
            )
          })}
          {fileItems.map((item) => {
            const status = getFileStatusPresentation(item.status)
            const itemError = getSafeSyncErrorMessage(item.lastError, 'file')
            return (
              <View
                key={item.id}
                style={styles.queueItem}
                testID={`sync-file-${item.status}`}
              >
                <View style={styles.queueHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.entity}>{item.name}</Text>
                    <Text style={styles.base}>
                      {item.entityType
                        ? `Файл · ${getQueueEntityTitle(item.entityType, item.entityId, labelsByEntity)}`
                        : 'Личное вложение'}
                    </Text>
                  </View>
                  <StatusChip label={status.label} tone={status.tone} />
                </View>
                {itemError ? (
                  <Notice tone="danger" message={itemError} />
                ) : null}
                {item.status === 'failed' ? (
                  <Button
                    testID="retry-sync-file"
                    title="Повторить файл"
                    variant="secondary"
                    loading={retryingId === `file:${item.id}`}
                    disabled={blocked}
                    onPress={() => retryFile(item.id)}
                  />
                ) : null}
              </View>
            )
          })}
        </Surface>
      ) : (
        <Surface>
          <Text style={styles.entity}>Всё отправлено</Text>
          <Text style={styles.base}>
            Локальных изменений и файлов в очереди нет.
          </Text>
        </Surface>
      )}
      <SectionTitle>Требуют решения</SectionTitle>
      {!confirmed ? <Notice tone={reading ? 'info' : 'warning'} message={reading ? 'Загружаем конфликты…' : 'Данные конфликтов недоступны.'} /> : conflicts.length ? (
        conflicts.map((conflict) => (
          <Surface key={conflict.id}>
            <Text style={styles.entity}>
              {getConflictEntityLabel(conflict.entityType)} ·{' '}
              {getConflictFieldLabel(conflict.path)}
            </Text>
            <Text style={styles.base}>
              Было:{' '}
              {formatConflictValue(conflict.path, conflict.base, labelsById)}
            </Text>
            <View style={styles.values}>
              <View style={styles.value}>
                <Text style={styles.label}>На телефоне</Text>
                <Text style={styles.content}>
                  {formatConflictValue(
                    conflict.path,
                    conflict.local,
                    labelsById
                  )}
                </Text>
              </View>
              <View style={styles.value}>
                <Text style={styles.label}>На сервере</Text>
                <Text style={styles.content}>
                  {formatConflictValue(
                    conflict.path,
                    conflict.remote,
                    labelsById
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.action}>
                <Button
                  testID="keep-local-conflict"
                  title="Оставить моё"
                  onPress={() => decide(conflict, 'local')}
                  loading={retryingId === `conflict:${conflict.id}:local`}
                  disabled={blocked}
                />
              </View>
              <View style={styles.action}>
                <Button
                  testID="accept-server-conflict"
                  title="Принять сервер"
                  variant="secondary"
                  onPress={() => decide(conflict, 'remote')}
                  loading={retryingId === `conflict:${conflict.id}:remote`}
                  disabled={blocked}
                />
              </View>
            </View>
          </Surface>
        ))
      ) : (
        <EmptyState
          title="Конфликтов нет"
          description="Несвязанные изменения объединяются автоматически."
        />
      )}
    </Screen>
  )
}

const Count = ({ label, value }: { label: string; value: number | string }) => {
  const styles = useThemeStyles(createStyles)
  return (
  <View style={styles.count}>
    <Text accessibilityLabel={`${label}: ${value === '—' ? 'нет данных' : value}`} style={styles.countValue}>{value}</Text>
    <Text style={styles.label}>{label}</Text>
  </View>
)
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { gap: spacing.md },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: {
    flexGrow: 1,
    flexBasis: 80,
    padding: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
  },
  countValue: { color: palette.text, fontSize: 22, fontWeight: '600' },
  label: { color: palette.cardMuted, fontSize: 11, fontWeight: '700' },
  entity: { color: palette.text, fontSize: 14, fontWeight: '600' },
  base: { color: palette.cardMuted, fontSize: 12, lineHeight: 17 },
  backgroundRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  databaseHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  databaseDetails: { gap: spacing.xs },
  queueItem: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  queueHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  value: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 4 },
  content: { color: palette.text, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 150 },
  flex: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
})
