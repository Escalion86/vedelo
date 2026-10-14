import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import type { Client } from '../../shared/domain/types'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { listCachedEntities, upsertEntities } from '../../shared/storage/cache'
import { QuickContacts } from '../../shared/ui/QuickContacts'
import { Notice } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import { getEventCardClientName } from './eventCard'

/** Известный/offline клиент читается из общего кэша; GET нужен только для отсутствующей связи. */
export function EventCardClientLookup({ clientId, availableWidth }: { clientId: string; availableWidth: number }) {
  const clients = useQuery({ queryKey: ['cached-entities', 'clients'], queryFn: () => listCachedEntities<Client>('clients'), networkMode: 'always' })
  const queryClient = useQueryClient()
  const cached = clients.data?.find(client => client._id === clientId)
  const local = clientId.startsWith('local-')
  const exact = useQuery({
    queryKey: ['event-card-client', clientId], enabled: !cached && !local && clients.isSuccess,
    retry: false, staleTime: 30_000,
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get<{ data: Client }>(`/mobile/v1/clients/${encodeURIComponent(clientId)}`, { signal })
        if (!response.data?._id || response.data._id !== clientId) throw new Error('Некорректный ответ клиента')
        await upsertEntities('clients', [response.data])
        void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] }).catch(() => undefined)
        return response.data
      } catch (error) {
        // Существующий clients GET возвращает JSON {error:'Клиент не найден'}.
        // parseApiError превращает этот legacy JSON в HTTP 404; generic HTML 404 имеет другую безопасную подпись.
        if (error instanceof ApiError && error.status === 404 && (error.code === 'not_found' || error.message === 'HTTP 404')) return null
        throw error
      }
    },
  })
  const client = cached || exact.data
  const retry = () => {
    if (clients.isError && !cached) void clients.refetch().catch(() => undefined)
    else if (!exact.isFetching) void exact.refetch().catch(() => undefined)
  }
  const state = client ? 'found' : clients.fetchStatus === 'paused' || exact.fetchStatus === 'paused' ? 'paused'
    : clients.isFetching || exact.isFetching ? 'loading'
    : clients.isError || exact.isError ? 'error'
    : local && clients.isSuccess ? 'local-missing'
    : exact.isSuccess && exact.data === null ? 'missing' : 'loading'
  return <EventCardClientState client={client || undefined} state={state} onRetry={retry} availableWidth={availableWidth} />
}
export function EventCardClientState({ client, state, onRetry, availableWidth }: {
  client?: Client; state: 'found' | 'none' | 'loading' | 'paused' | 'error' | 'missing' | 'local-missing'; onRetry?: () => void; availableWidth: number
}) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  if (state === 'error') return <View testID="event-client-error" style={styles.error}>
    <Notice tone="danger" message="Не удалось загрузить клиента" />
    <Pressable testID="event-client-retry" accessibilityRole="button" accessibilityLabel="Повторить загрузку клиента" style={styles.retry}
      onPress={event => { event.stopPropagation(); onRetry?.() }}><Text style={styles.name}>Повторить</Text></Pressable>
  </View>
  const label = state === 'none' ? '-' : state === 'missing' ? 'Клиент не найден' : state === 'local-missing' ? 'Клиент недоступен на устройстве'
    : state === 'paused' ? 'Нет сети — ждём подключения' : state === 'loading' ? 'Загрузка клиента…' : getEventCardClientName(client)
  return <View testID={`event-client-${state}`} style={styles.row} accessibilityLiveRegion="polite" accessibilityState={{ busy: state === 'loading' }}>
    {state === 'loading' ? <ActivityIndicator accessibilityLabel="Загрузка клиента" size="small" color={palette.primary} /> : null}
    <Text accessibilityLabel={state === 'none' ? 'Клиент не указан' : state === 'found' ? `Клиент: ${label}` : label}
      style={styles.name} numberOfLines={state === 'found' ? 1 : undefined}>{label}</Text>
    {client ? <QuickContacts client={client} availableWidth={availableWidth} /> : null}
    {client ? <Pressable accessibilityRole="button" accessibilityLabel="Открыть клиента" style={styles.retry}
      onPress={event => { event.stopPropagation(); router.push(`/clients/${client._id}` as never) }}><Text style={styles.name}>›</Text></Pressable> : null}
  </View>
}
const createStyles = (p: Palette) => StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  name: { flexShrink: 1, minWidth: 0, fontFamily: typography.fontFamily, color: p.cardMeta, fontSize: 13.12, lineHeight: 18 },
  error: { flex: 1, minWidth: 0, gap: 4 }, retry: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
})
