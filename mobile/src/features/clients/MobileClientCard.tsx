import { useMemo, useState } from 'react'
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { Client } from '../../shared/domain/types'
import { Surface } from '../../shared/ui/components'
import { QuickActionsSheet, QuickContacts } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { clientName, clientSummary, contactChannelLabel, plainComment } from './clientList'

const statuses = {
  draft: { label: 'Ждём ответа', tone: 'warning' }, active: { label: 'Подтверждена', tone: 'success' },
  canceled: { label: 'Отменена', tone: 'danger' }, closed: { label: 'Закрыта', tone: 'neutral' },
} as const
export function MobileClientCard({ client, summary, onDelete }: {
  client: Client; summary: ReturnType<typeof clientSummary>; onDelete: (client: Client) => void
}) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = useWorkItemTerminology()
  const { width } = useWindowDimensions()
  const [actions, setActions] = useState(false)
  const busy = client.syncStatus === 'syncing'
  const failed = client.syncStatus === 'failed' || client.syncStatus === 'conflict'
  const open = (path: string) => { setActions(false); router.push(path as never) }
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, state) => !busy && Math.abs(state.dx) > 18 && Math.abs(state.dx) > Math.abs(state.dy) * 2,
    onPanResponderRelease: (_, state) => {
      if (state.dx < -60) router.push(`/clients/edit/${client._id}` as never)
      if (state.dx > 60) onDelete(client)
    },
  }), [busy, client, onDelete])
  const status = summary.latest ? statuses[summary.latest.status] : null
  const tone = status ? palette.notice[status.tone] : palette.notice.neutral
  const date = summary.lastDate ? new Date(summary.lastDate).toLocaleDateString('ru-RU') : '—'
  const stats = [
    ['Заявки', summary.counts.requests], ['Отмены', summary.counts.canceled],
    ['Выполн.', summary.counts.finished + summary.counts.closed],
    [terms.pluralCapitalized, summary.counts.active],
  ] as const
  return <View {...gestures.panHandlers}>
    <Pressable testID={`client-card-${client._id}`} accessibilityRole="button" accessibilityLabel={`Открыть клиента: ${clientName(client)}`}
      disabled={busy} onPress={() => open(`/clients/${client._id}`)} style={({ pressed }) => pressed && styles.pressed}>
      <Surface style={styles.card} testID={`client-shell-${client._id}`}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={[styles.name, { fontSize: width < 420 ? 15.2 : 16 }]}>{clientName(client)}</Text>
          {client.messengerPushMuted ? <MaterialCommunityIcons accessible accessibilityLabel="Push-уведомления отключены" name="bell-off-outline" size={18} color={palette.cardMuted} /> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Действия с клиентом: ${clientName(client)}`} accessibilityState={{ expanded: actions, disabled: busy }}
          disabled={busy} style={styles.menu} onPress={(e) => { e.stopPropagation(); setActions(true) }}>
          <MaterialCommunityIcons name="dots-vertical" size={22} color={palette.cardMuted} />
        </Pressable>
        <View style={styles.middle}>
          <View style={styles.last}><Text style={styles.meta}>Последняя заявка: {date}</Text>
            {status ? <View style={[styles.badge, { backgroundColor: tone.background, borderColor: tone.border }]}><Text style={[styles.badgeText, { color: tone.text }]}>{status.label}</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={styles.comment}>{contactChannelLabel(client) ? `Предпочитает ${contactChannelLabel(client)}` : plainComment(client.comment) || ' '}</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.stats}>{stats.filter(([, count]) => count > 0).map(([label, count]) => <Text key={label} style={styles.stat}>{label} {count}</Text>)}</View>
          <QuickContacts client={client} maxVisible={width < 360 ? 1 : 2} />
        </View>
        {client.syncStatus === 'pending' ? <Text style={styles.meta}>Ожидает отправки</Text> : null}
        {busy ? <ActivityIndicator accessibilityLabel="Синхронизация клиента" color={palette.primary} /> : null}
        {failed ? <Pressable accessibilityRole="button" accessibilityLabel="Открыть синхронизацию" onPress={(e) => { e.stopPropagation(); open('/sync') }}><Text style={styles.error}>{client.syncStatus === 'conflict' ? 'Конфликт изменений' : 'Не удалось синхронизировать'}</Text></Pressable> : null}
      </Surface>
    </Pressable>
    <QuickActionsSheet title="Действия с клиентом" visible={actions} onClose={() => setActions(false)}>
      {[
        ['Открыть', `/clients/${client._id}`], ['Редактировать', `/clients/edit/${client._id}`],
        ['Файлы и документы', `/clients/${client._id}/documents`], ['Объединить клиентов', `/clients/${client._id}/merge`],
      ].map(([title, path]) => <Pressable key={title} accessibilityRole="button" style={styles.action} onPress={() => open(path)}><Text style={styles.comment}>{title}</Text></Pressable>)}
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => { setActions(false); onDelete(client) }}><Text style={styles.error}>Удалить клиента</Text></Pressable>
    </QuickActionsSheet>
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  card: { padding: 12, gap: 0, marginBottom: 0 }, pressed: { opacity: 0.78 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: palette.border, paddingRight: 40, paddingBottom: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: palette.cardTitle },
  menu: { position: 'absolute', top: 4, right: 4, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  middle: { paddingVertical: 8, gap: 8 }, last: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { fontSize: 13, color: palette.cardMuted }, comment: { fontSize: 14, color: palette.cardMeta },
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }, badgeText: { fontSize: 12, fontWeight: '600' },
  footer: { borderTopWidth: 1, borderColor: palette.border, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, stat: { fontSize: 11, color: palette.cardMuted },
  error: { color: palette.notice.danger.text, fontSize: 13 }, action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
})
