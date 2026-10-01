import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { Event } from '../../shared/domain/types'
import { EVENT_SECTIONS, type EventSection } from '../../shared/domain/eventForm'
import { Button } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { eventActionReasons } from './eventDetail'

export const editEventSection = (id: string, section: EventSection) =>
  router.push({ pathname: '/events/edit/[id]', params: { id, section } } as never)
export const EventDetailActions = ({ event, online }: { event: Event; online: boolean }) => {
  const [open, setOpen] = useState(false)
  const styles = useThemeStyles(createStyles)
  const reasons = eventActionReasons(event, online)
  const action = (title: string, onPress: () => void, reason = '') => <View key={title}>
    <Button title={title} variant="secondary" disabled={Boolean(reason)} onPress={() => { setOpen(false); onPress() }} />
    {reason ? <Text style={styles.reason}>{reason}</Text> : null}
  </View>
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Действия с работой" accessibilityState={{ expanded: open }}
      onPress={() => setOpen(true)} style={styles.trigger}><Text style={styles.text}>Действия ⋯</Text></Pressable>
    <QuickActionsSheet title="Действия с работой" visible={open} onClose={() => setOpen(false)}>
      <View style={styles.actions}>
        {EVENT_SECTIONS.map(([key, title]) => action(`Изменить: ${title}`, () => editEventSection(event._id, key)))}
        {action('Добавить оплату или расход', () => router.push({ pathname: '/finance/edit/new', params: { eventId: event._id, clientId: event.clientId || '' } } as never), reasons.payment)}
        {action('Документы', () => router.push(`/events/${event._id}/documents` as never))}
        {action('История действий', () => router.push({ pathname: '/history', params: { entityType: 'event', entityId: event._id } } as never), reasons.history)}
        {action('Переписки Avito и VK', () => router.push({ pathname: '/conversations', params: { eventId: event._id } } as never), reasons.conversations)}
        {action('Клонировать', () => router.push({ pathname: '/events/edit/new', params: { cloneId: event._id } } as never))}
      </View>
    </QuickActionsSheet>
  </>
}
const createStyles = (p: Palette) => StyleSheet.create({
  actions: { gap: 12 }, trigger: { minHeight: 44, justifyContent: 'center', padding: 8 },
  text: { color: p.primary, fontSize: 14, fontWeight: '600' }, reason: { color: p.cardMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
})
