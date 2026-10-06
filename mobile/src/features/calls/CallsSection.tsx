import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { api } from '../../shared/api/client'
import type { Call, Client } from '../../shared/domain/types'
import { listCachedEntities } from '../../shared/storage/cache'
import { Button, EmptyState, Notice, StatusChip, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { callStatusLabel, checkedCall, clientLabel, communicationError, directionLabel, durationLabel, localDateLabel, successfulData } from './communication'
import { useCommunicationSession } from './useCommunicationSession'

const filters = [['all', 'Все'], ['new', 'Новые'], ['ready', 'Готовые'], ['linked', 'Связанные'], ['ignored', 'Не клиенты'], ['failed', 'Ошибки']] as const
export const CallsSection = () => {
  const session = useCommunicationSession()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState<Call[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [cacheError, setCacheError] = useState('')
  const load = useCallback(async () => {
    const token = session.begin(); if (token === null) return
    setLoading(true); setError(''); setCacheError('')
    const results = await Promise.allSettled([api.get<unknown>(`/mobile/v1/calls?limit=80&status=${filter}`), listCachedEntities<Client>('clients')])
    if (session.valid(token)) {
      try {
        if (results[0].status === 'rejected') throw results[0].reason
        const data = successfulData(results[0].value)
        if (!Array.isArray(data)) throw new Error('invalid_list')
        setItems(data.map((item) => checkedCall(item))); setReady(true)
      } catch (reason) { setItems([]); setReady(false); setError(communicationError(reason, 'Не удалось загрузить звонки. Повторите чтение.')) }
      if (results[1].status === 'fulfilled') setClients(results[1].value)
      else { setClients([]); setCacheError('Не удалось прочитать клиентов. Журнал звонков доступен без их имён.') }
      setLoading(false)
    }
    session.end(token)
  }, [filter, session])
  useFocusEffect(useCallback(() => { void load() }, [load]))
  return <>
    <View style={styles.filters}>{filters.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value, disabled: loading }} disabled={loading} onPress={() => { setItems([]); setReady(false); setFilter(value) }} style={({ pressed }) => [styles.filter, value === filter && styles.selected, pressed && styles.pressed]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
    {loading ? <Notice message={ready ? 'Обновляем звонки…' : 'Загружаем звонки…'} /> : null}
    {error ? <Notice tone="danger" message={error} /> : null}
    {cacheError ? <Notice tone="warning" message={cacheError} /> : null}
    {items.map((call) => {
      const client = clients.find((item) => item._id === call.linkedClientId)
      return <Pressable key={call._id} accessibilityRole="button" accessibilityLabel={`Открыть звонок ${call.phone || 'без номера'}`} onPress={() => router.push(`/calls/${encodeURIComponent(call._id)}` as never)} style={({ pressed }) => pressed && styles.pressed}>
        <Surface style={styles.card}><View style={styles.row}><MaterialCommunityIcons name={call.direction === 'outgoing' ? 'phone-outgoing-outline' : call.direction === 'incoming' ? 'phone-incoming-outline' : 'phone-outline'} size={20} color={palette.primary} /><View style={styles.grow}><Text style={styles.title} numberOfLines={2}>{call.phone || 'Без номера'}</Text><Text style={styles.muted}>{directionLabel(call.direction)} · {localDateLabel(call.startedAt)}</Text><Text style={styles.muted}>Клиент: {client ? clientLabel(client) : call.linkedClientId ? 'недоступен в текущих данных' : 'не связан'}</Text><Text style={styles.muted}>{durationLabel(call.durationSec)}</Text></View></View><View style={styles.row}><StatusChip label={callStatusLabel(call.status)} tone={call.status === 'failed' ? 'danger' : call.status === 'linked' || call.status === 'ready' ? 'success' : 'neutral'} /></View>{call.aiExtractedFields?.clientName && !client ? <Text style={styles.text} numberOfLines={2}>{call.aiExtractedFields.clientName}</Text> : null}{call.aiSummary || call.transcript ? <Text style={styles.text} numberOfLines={2}>{call.aiSummary || call.transcript}</Text> : null}</Surface>
      </Pressable>
    })}
    {ready && !loading && !items.length ? <EmptyState title="Нет звонков" description={filter === 'all' ? 'Журнал появится после первого звонка через IP-телефонию.' : 'Звонков с выбранным статусом нет.'} /> : null}
    {ready ? <Text style={styles.muted}>Показано: {items.length}. Журнал ограничен последними 80 звонками.</Text> : null}
    <Button title={error ? 'Повторить чтение звонков' : 'Обновить звонки'} variant="secondary" onPress={() => void load()} loading={loading} />
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, filter: { minHeight: 40, justifyContent: 'center', padding: 8, borderWidth: 1, borderRadius: 4, borderColor: palette.border, backgroundColor: palette.surface },
  selected: { backgroundColor: palette.rowSelected, borderColor: palette.primary }, pressed: { opacity: 0.82 },
  card: { padding: 10, gap: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, grow: { flex: 1, minWidth: 0 },
  title: { color: palette.text, fontSize: 14, fontWeight: '700' }, text: { color: palette.text, fontSize: 13, lineHeight: 19, flexShrink: 1 }, muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 17 },
})
