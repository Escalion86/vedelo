import { useMemo, useRef, useState } from 'react'
import NetInfo, { useNetInfo } from '@react-native-community/netinfo'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../../src/shared/api/client'
import type { Client } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { useCachedEntities } from '../../../src/shared/hooks/useCachedEntities'
import { removeCachedEntity, upsertEntities } from '../../../src/shared/storage/cache'
import { runSync } from '../../../src/shared/sync/syncEngine'
import { Button, ErrorNotice, PageHeader, Screen, SectionTitle, Surface } from '../../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { clientName } from '../../../src/features/clients/clientList'

type MergeCounts = {
  events: number
  eventsOtherContacts: number
  eventsColleague: number
  transactions: number
  avitoConversations: number
  avitoMessages: number
  vkConversations: number
  vkMessages: number
  calls: number
  total: number
}

type MergePreview = {
  targetClient: Client
  duplicateClient: Client
  preview: MergeCounts
}

const name = (client?: Client | null) => client
  ? clientName(client)
  : 'Клиент'

export default function ClientMergeScreen() {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = useWorkItemTerminology()
  const network = useNetInfo()
  const online = network.isConnected === true && network.isInternetReachable !== false
  const busy = useRef(false)
  const selection = useRef('')
  const currentPair = useRef<{ target?: Client; duplicate?: Client; online: boolean }>({ online })
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const clientsQuery = useCachedEntities<Client>('clients')
  const [search, setSearch] = useState('')
  const [duplicateId, setDuplicateId] = useState('')
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  const target = useMemo(() => (clientsQuery.data || []).find((client) => client._id === id), [clientsQuery.data, id])
  const candidates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru')
    return (clientsQuery.data || []).filter((client) => {
      if (client._id === id || client._id.startsWith('local-')) return false
      if (client.syncStatus && client.syncStatus !== 'synced') return false
      return !needle || `${name(client)} ${client.phone || ''} ${client.email || ''}`.toLocaleLowerCase('ru').includes(needle)
    }).sort((a, b) => name(a).localeCompare(name(b), 'ru'))
  }, [clientsQuery.data, id, search])

  const duplicate = (clientsQuery.data || []).find((client) => client._id === duplicateId)
  currentPair.current = { target, duplicate, online }
  const canMergeClient = (client?: Client) => Boolean(client && !client._id.startsWith('local-') && (!client.syncStatus || client.syncStatus === 'synced'))
  const ensureOnline = async () => {
    const state = await NetInfo.fetch()
    if (state.isConnected !== true || state.isInternetReachable === false || !currentPair.current.online) throw new Error('Объединение клиентов доступно только при подключении к интернету.')
    if (!canMergeClient(currentPair.current.target) || !canMergeClient(currentPair.current.duplicate)) throw new Error('Сначала синхронизируйте обоих клиентов.')
  }
  const loadPreview = async () => {
    if (busy.current) return
    if (!duplicateId) {
      setError('Выберите клиента-дубль')
      return
    }
    const requestedId = duplicateId
    busy.current = true; setLoading(true)
    setError(''); setPreview(null)
    try {
      await ensureOnline()
      const response = await api.get<{ success: true; data: MergePreview }>(
        `/mobile/v1/clients/${id}/merge?duplicateClientId=${encodeURIComponent(duplicateId)}`
      )
      if (selection.current !== requestedId) return
      if (response.data.targetClient?._id !== id || response.data.duplicateClient?._id !== requestedId) throw new Error('Сервер вернул связи другого клиента')
      setPreview(response.data)
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить связи')
    } finally {
      busy.current = false; setLoading(false)
    }
  }

  const merge = () => {
    if (!preview || busy.current || !online || preview.duplicateClient._id !== duplicateId) return
    const confirmedId = preview.duplicateClient._id
    Alert.alert(
      'Объединить клиентов?',
      `«${name(preview.duplicateClient)}» будет удалён, а его данные и ${preview.preview.total} связей перейдут к «${name(preview.targetClient)}». Отменить это действие нельзя.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Объединить',
          style: 'destructive',
          onPress: async () => {
            if (busy.current || selection.current !== confirmedId) return
            busy.current = true; setMerging(true)
            setError('')
            try {
              await ensureOnline()
              setPreview(null)
              const response = await api.post<{
                success: true
                data: { client: Client; deletedClientId: string; moved: MergeCounts }
              }>(`/mobile/v1/clients/${id}/merge`, { duplicateClientId: confirmedId })
              if (response.data.deletedClientId !== confirmedId || response.data.client?._id !== id) throw new Error('Ответ объединения не соответствует выбранным клиентам')
              const verified = await api.get<{ success: true; data: Client }>(`/mobile/v1/clients/${id}`)
              if (!verified.success || verified.data?._id !== id) throw new Error('Не удалось проверить результат объединения. Обновите список перед повторной попыткой.')
              await removeCachedEntity('clients', confirmedId)
              await upsertEntities('clients', [verified.data])
              await runSync()
              await Promise.all(['clients', 'events', 'transactions'].map((entityType) =>
                queryClient.invalidateQueries({ queryKey: ['cached-entities', entityType] })))
              router.replace(`/clients/${id}` as never)
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Не удалось объединить клиентов')
            } finally {
              busy.current = false; setMerging(false)
            }
          },
        },
      ],
    )
  }

  if (clientsQuery.isPending) return <Screen><PageHeader title="Объединение клиентов" /><Text style={styles.muted}>Загрузка клиентов…</Text></Screen>
  if (clientsQuery.isError) return <Screen><PageHeader title="Объединение клиентов" /><ErrorNotice message="Не удалось прочитать клиентов" /><Button title="Повторить чтение" onPress={() => { void clientsQuery.refetch() }} /></Screen>
  if (!online) return <Screen><PageHeader title="Объединение клиентов" /><ErrorNotice message="Объединение клиентов доступно только при подключении к интернету." /><Button title="Назад" variant="secondary" onPress={() => router.back()} /></Screen>
  if (!target || target._id.startsWith('local-') || (target.syncStatus && target.syncStatus !== 'synced')) {
    return <Screen><PageHeader title="Объединение клиентов" /><ErrorNotice message="Сначала синхронизируйте основного клиента." /><Button title="Назад" variant="secondary" onPress={() => router.back()} /></Screen>
  }

  return (
    <Screen>
      <PageHeader title="Объединение клиентов" subtitle={`Основной: ${name(target)}`} />
      <Surface>
        <SectionTitle>Выберите дубликат</SectionTitle>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={21} color={palette.cardMuted} />
          <TextInput value={search} onChangeText={setSearch} style={styles.searchInput} placeholder="Имя, телефон или email" placeholderTextColor={palette.cardMuted} keyboardAppearance={palette.mode} />
        </View>
        {candidates.map((client) => (
          <Pressable
            accessibilityRole="button"
            key={client._id}
            style={[styles.candidate, duplicateId === client._id && styles.candidateActive]}
            disabled={loading || merging}
            accessibilityState={{ selected: duplicateId === client._id, disabled: loading || merging }}
            onPress={() => { selection.current = client._id; setDuplicateId(client._id); setPreview(null); setError('') }}
          >
            <View style={styles.grow}><Text style={styles.candidateName}>{name(client)}</Text><Text style={[styles.muted, duplicateId === client._id && { color: palette.cardMeta }]}>{formatPhoneForDisplay(client.phone) || client.email || 'Контакты не указаны'}</Text></View>
            <MaterialCommunityIcons name={duplicateId === client._id ? 'radiobox-marked' : 'radiobox-blank'} size={23} color={duplicateId === client._id ? palette.primary : palette.cardMuted} />
          </Pressable>
        ))}
        {!candidates.length ? <Text style={styles.muted}>Синхронизированных кандидатов не найдено.</Text> : null}
        <Button title="Проверить связи" variant="secondary" disabled={!duplicateId || merging} loading={loading} onPress={loadPreview} />
      </Surface>

      {preview ? (
        <Surface>
          <SectionTitle>Что будет перенесено</SectionTitle>
          <Count label={terms.pluralCapitalized} value={preview.preview.events} />
          <Count label="Дополнительные контакты" value={preview.preview.eventsOtherContacts} />
          <Count label="Передача коллеге" value={preview.preview.eventsColleague} />
          <Count label="Транзакции" value={preview.preview.transactions} />
          <Count label="Переписки Avito/VK" value={preview.preview.avitoConversations + preview.preview.vkConversations} />
          <Count label="Сообщения" value={preview.preview.avitoMessages + preview.preview.vkMessages} />
          <Count label="Звонки" value={preview.preview.calls} />
          <View style={styles.total}><Text style={styles.totalLabel}>Всего связей</Text><Text style={styles.totalValue}>{preview.preview.total}</Text></View>
          <Text style={styles.warning}>Пустые поля основного клиента будут дополнены данными дубля. Комментарии и уникальные значимые даты сохранятся.</Text>
        </Surface>
      ) : null}

      {error ? <ErrorNotice message={error} /> : null}
      <Button title="Объединить и удалить дубликат" variant="danger" disabled={!preview || loading} loading={merging} onPress={merge} />
    </Screen>
  )
}

const Count = ({ label, value }: { label: string; value: number }) => {
  const styles = useThemeStyles(createStyles)
  return <View style={styles.count}><Text style={styles.countLabel}>{label}</Text><Text style={styles.countValue}>{value}</Text></View>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, color: palette.text, fontSize: 15 },
  candidate: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md },
  candidateActive: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
  grow: { flex: 1 }, candidateName: { color: palette.text, fontSize: 14, fontWeight: '700' }, muted: { color: palette.cardMuted, fontSize: 12, marginTop: 3 },
  count: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  countLabel: { flex: 1, color: palette.cardMuted, fontSize: 13 }, countValue: { color: palette.text, fontSize: 14, fontWeight: '800' },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.rowSelected },
  totalLabel: { color: palette.text, fontSize: 14, fontWeight: '700' }, totalValue: { color: palette.selectionText, fontSize: 18, fontWeight: '800' },
  warning: { color: palette.notice.warning.text, fontSize: 12, lineHeight: 18, padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.notice.warning.background },
})
