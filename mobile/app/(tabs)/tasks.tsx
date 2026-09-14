import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import type { Event } from '../../src/shared/domain/types'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { saveLocalEntity } from '../../src/shared/storage/mutations'
import { EmptyState, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { colors, spacing } from '../../src/shared/ui/theme'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

export default function TasksScreen() {
  const terms = useWorkItemTerminology()
  const query = useCachedEntities<Event>('events')
  const queryClient = useQueryClient()
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1)
    const result = { overdue: [] as Array<{ event: Event; index: number }>, today: [] as Array<{ event: Event; index: number }>, tomorrow: [] as Array<{ event: Event; index: number }> }
    for (const event of query.data || []) {
      if (['closed', 'canceled'].includes(event.status)) continue
      ;(event.additionalEvents || []).forEach((task, index) => {
        if (task.done || !task.date) return
        const time = new Date(task.date).getTime()
        if (time < today.getTime()) result.overdue.push({ event, index })
        else if (time < tomorrow.getTime()) result.today.push({ event, index })
        else if (time < dayAfter.getTime()) result.tomorrow.push({ event, index })
      })
    }
    return result
  }, [query.data])
  const complete = async (event: Event, index: number) => {
    const additionalEvents = [...(event.additionalEvents || [])]
    additionalEvents[index] = { ...additionalEvents[index], done: true, doneAt: new Date().toISOString() }
    await saveLocalEntity({ entityType: 'events', entityId: event._id, values: { additionalEvents } })
    await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
  }
  const allEmpty = !groups.overdue.length && !groups.today.length && !groups.tomorrow.length
  return <Screen contentStyle={styles.screenContent}><PageHeader title="Задачи" subtitle="Следующие контакты с клиентами" />{allEmpty ? <EmptyState title="Активных задач нет" description={`Добавьте следующий контакт в карточке ${terms.genitive}.`} /> : null}<TaskGroup title="Просрочено" items={groups.overdue} danger onComplete={complete} fallbackTitle={terms.labelCapitalized} /><TaskGroup title="Сегодня" items={groups.today} onComplete={complete} fallbackTitle={terms.labelCapitalized} /><TaskGroup title="Завтра" items={groups.tomorrow} onComplete={complete} fallbackTitle={terms.labelCapitalized} /></Screen>
}
const TaskGroup = ({ title, items, danger = false, onComplete, fallbackTitle }: { title: string; items: Array<{ event: Event; index: number }>; danger?: boolean; onComplete: (event: Event, index: number) => void; fallbackTitle: string }) => items.length ? <View style={styles.group}><SectionTitle>{title} · {items.length}</SectionTitle>{items.map(({ event, index }) => { const task = event.additionalEvents?.[index]; return <Pressable key={`${event._id}-${index}`} onPress={() => router.push(`/events/${event._id}` as never)}><Surface><View style={styles.row}><Pressable hitSlop={8} onPress={() => onComplete(event, index)}><MaterialCommunityIcons name="checkbox-blank-circle-outline" size={25} color={danger ? colors.danger : colors.primary} /></Pressable><View style={styles.grow}><Text style={styles.title}>{task?.title || 'Задача'}</Text><Text style={styles.meta}>{event.eventType || fallbackTitle} · {task?.date ? new Date(task.date).toLocaleString('ru-RU') : ''}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></View></Surface></Pressable> })}</View> : null
const styles = StyleSheet.create({ screenContent: { paddingBottom: 0 }, group: { gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, grow: { flex: 1 }, title: { color: colors.text, fontSize: 14, fontWeight: '700' }, meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 } })
