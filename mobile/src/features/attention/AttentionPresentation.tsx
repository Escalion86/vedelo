import { typography } from '../../shared/ui/theme'
import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { router } from 'expo-router'
import type { Client, Event } from '../../shared/domain/types'
import { FieldHelp } from '../../shared/ui/FieldHelp'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette, TemporalStatus } from '../../shared/ui/theme'
import type { selectAttention } from './selectors'

/** The section root is a direct child of the main scroll content, so its y is a scroll target. */
export function AttentionSection({ id, title, count, tone = 'neutral', accent, help, onLayout, children }: PropsWithChildren<{
  id: string; title: string; count?: number; tone?: TemporalStatus; accent?: string; help?: string
  onLayout: (event: LayoutChangeEvent) => void
}>) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const role = palette.status[tone]
  return <View testID={`attention-section-${id}`} onLayout={onLayout}
    style={[styles.section, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null]}>
    <View style={styles.heading}>
      <View style={styles.headingLabel}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {help ? <FieldHelp label={title} text={help} /> : null}
      </View>
      {count != null ? <View testID={`attention-count-${id}`} accessible accessibilityLabel={`${title}: ${count}`}
        style={[styles.count, { backgroundColor: role.background, borderColor: role.border }]}>
        <Text style={[styles.countText, { color: role.text }]}>{count}</Text>
      </View> : null}
    </View>
    {children}
  </View>
}

export function SummaryChip({ id, label, color, onPress }: { id: string; label: string; color: string; onPress: () => void }) {
  const styles = useThemeStyles(createStyles)
  return <Pressable testID={`attention-summary-${id}`} accessibilityRole="button" accessibilityLabel={label}
    style={styles.summaryTarget} onPress={onPress}>
    {({ pressed }) => <View style={[styles.capsule, pressed && styles.pressed]}>
      <View testID={`attention-summary-dot-${id}`} style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.summaryText}>{label}</Text>
    </View>}
  </Pressable>
}

/** Local small actions; shared buttons and all other forms retain their own sizes. */
export function CompactAction({ title, variant = 'secondary', disabled = false, loading = false, testID, onPress }: {
  title: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning'; disabled?: boolean; loading?: boolean
  testID?: string; onPress: () => void
}) {
  const styles = useThemeStyles(createStyles)
  const blocked = disabled || loading
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled: blocked, busy: loading }} disabled={blocked}
    onPress={() => { if (!blocked) onPress() }}
    style={({ pressed }) => [styles.action, styles[variant], pressed && styles.pressed, blocked && styles.disabled]}>
    {loading ? <ActivityIndicator size="small" accessibilityLabel="Сохраняем" /> : null}
    <Text style={[styles.actionText, styles[`${variant}Text`]]}>{title}</Text>
  </Pressable>
}

const clientName = (client?: Client) => [client?.firstName, client?.secondName, client?.thirdName].filter(Boolean).join(' ') || 'Клиент не указан'

export function RequestCard({ event, client, past }: { event: Event; client?: Client; past: boolean }) {
  const styles = useThemeStyles(createStyles)
  const displayDate = past ? event.dateEnd ?? event.eventDate : event.eventDate
  return <View testID={`attention-request-${event._id}`} style={styles.request}>
    <Text style={styles.title}>{clientName(client)}</Text>
    <Text style={styles.requestType}>{event.eventType || 'Заявка'}</Text>
    {displayDate ? <Text style={styles.meta}>{`${past && event.dateEnd ? 'Окончание работы' : 'Дата работы'}: ${new Date(displayDate).toLocaleString('ru-RU')}`}</Text> : null}
    <View testID={`attention-request-actions-${event._id}`} style={styles.actions}>
      {past ? <>
        <CompactAction title="Закрыть" onPress={() => router.push({ pathname: '/events/edit/[id]', params: { id: event._id, decision: 'closed', section: 'finance' } } as never)} />
        <CompactAction title="Отменить" onPress={() => router.push({ pathname: '/events/edit/[id]', params: { id: event._id, decision: 'canceled' } } as never)} />
        <CompactAction title="Перенести дату" onPress={() => router.push({ pathname: '/events/edit/[id]', params: { id: event._id, section: 'general' } } as never)} />
      </> : <CompactAction title="Назначить контакт" variant="primary" onPress={() => router.push({ pathname: '/events/edit/[id]', params: { id: event._id, section: 'contacts' } } as never)} />}
      <CompactAction title="Открыть заявку" variant="ghost" onPress={() => router.push(`/events/${event._id}` as never)} />
    </View>
  </View>
}

type ClientDate = ReturnType<typeof selectAttention>['clientDates'][number]
export function ClientDateRow({ item }: { item: ClientDate }) {
  const styles = useThemeStyles(createStyles)
  const days = item.daysLeft === 0 ? 'Сегодня' : item.daysLeft === 1 ? 'Завтра' : `Через ${item.daysLeft} дн.`
  return <Pressable testID={`attention-client-date-${item.key}`} accessibilityRole="button"
    accessibilityLabel={`${item.title}, ${clientName(item.client)}, ${item.nextDate.toLocaleDateString('ru-RU')}, ${days}`}
    onPress={() => router.push(`/clients/${item.client._id}` as never)}
    style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}>
    <View testID={`attention-date-details-${item.key}`} style={styles.dateDetails}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.meta}>{clientName(item.client)}</Text>
      {item.comment ? <Text style={styles.meta}>{item.comment}</Text> : null}
    </View>
    <View testID={`attention-date-deadline-${item.key}`} style={styles.dateDeadline}>
      <Text style={styles.dateText}>{item.nextDate.toLocaleDateString('ru-RU')}</Text>
      <Text style={styles.dateDays}>{days}</Text>
    </View>
  </Pressable>
}

const createStyles = (p: Palette) => StyleSheet.create({
  section: { borderWidth: 1, borderColor: p.border, borderRadius: 8, padding: 12, gap: 8, backgroundColor: p.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingLabel: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontFamily: typography.fontFamily, color: p.cardTitle, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  count: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  countText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  summaryTarget: { minHeight: 40, minWidth: 40, maxWidth: '100%', justifyContent: 'center' },
  // .attention-summary-chip has separate values from standard secondary buttons.
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 11,
    backgroundColor: p.mode === 'dark' ? 'rgba(255,255,255,0.05)' : p.surface,
    borderColor: p.mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#ece5d8' },
  dot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
  summaryText: { fontFamily: typography.fontFamily, color: p.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  action: { minHeight: 40, minWidth: 40, maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  secondary: { borderWidth: 1, borderColor: p.secondaryBorder, backgroundColor: p.secondaryBackground },
  secondaryText: { color: p.secondaryText },
  primary: { backgroundColor: p.primary },
  primaryText: { color: p.onPrimary },
  ghost: { backgroundColor: 'transparent' },
  ghostText: { color: p.cardMuted },
  danger: { borderWidth: 1, borderColor: p.notice.danger.border, backgroundColor: p.notice.danger.background },
  dangerText: { color: p.notice.danger.text },
  warning: { borderWidth: 1, borderColor: p.notice.warning.border, backgroundColor: p.notice.warning.background },
  warningText: { color: p.notice.warning.text },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.65 },
  request: { borderWidth: 1, borderColor: p.border, borderRadius: 8, padding: 12, gap: 4 },
  requestType: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 14 },
  meta: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: p.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  dateDetails: { flex: 1, minWidth: 0, gap: 4 },
  dateDeadline: { flexShrink: 0, alignItems: 'flex-end', gap: 4 },
  dateText: { fontFamily: typography.fontFamily, color: p.cardTitle, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  dateDays: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 12, fontWeight: '500', textAlign: 'right' },
})
