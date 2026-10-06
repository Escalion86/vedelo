import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { Button, Notice, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { availableHistoryRoute } from './api'
import type { HistoryItem } from './types'
export const sourceLabels: Record<string, string> = { web: 'Web', android: 'Android', public_api: 'Public API', tilda: 'Tilda', google_import: 'Google Calendar', avito: 'Avito', vk: 'VK', telephony: 'Телефония', file_import: 'Импорт из файла' }
const semanticLabels: Record<string, string> = { task_created: 'Добавлена задача', task_deleted: 'Удалена задача', task_completed: 'Выполнена задача', task_rescheduled: 'Перенесена задача', task_updated: 'Изменена задача' }
const statusLabels: Record<string, string> = { draft: 'Заявка', active: 'Подтверждено', canceled: 'Отменено', closed: 'Закрыто' }
export const historyValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (field === 'status') return statusLabels[String(value)] || String(value)
  if (['amount', 'contractSum', 'depositExpectedAmount'].includes(field) && Number.isFinite(Number(value))) return `${Number(value).toLocaleString('ru-RU')} ₽`
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toLocaleString('ru-RU')
  if (Array.isArray(value)) return value.map((item) => item && typeof item === 'object' ? String(item.title || item.name || 'Запись') : String(item)).join(', ') || 'Пусто'
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).filter((item) => item !== null && typeof item !== 'object' && item !== '').join(', ') || 'Изменено'
  return String(value)
}
export function HistoryRow({ item, navigationAllowed }: { item: HistoryItem; navigationAllowed: boolean }) {
  const styles = useThemeStyles(createStyles); const terms = useWorkItemTerminology(); const { user } = useAuth()
  const [open, setOpen] = useState(false); const [working, setWorking] = useState(false); const [error, setError] = useState('')
  const life = useRef({ active: false, epoch: 0 }); const lock = useRef(false)
  useFocusEffect(useCallback(() => {
    life.current.active = navigationAllowed; ++life.current.epoch
    setWorking(false); setError('')
    return () => { life.current.active = false; ++life.current.epoch }
  }, [navigationAllowed, user?._id, user?.tenantId, item.entityType, item.entityId]))
  const openEntity = async () => {
    const epoch = life.current.epoch
    const current = () => life.current.active && life.current.epoch === epoch
    if (!navigationAllowed || !item.entityExists || lock.current || !current()) return
    lock.current = true; setWorking(true); setError('')
    try {
      const path = await availableHistoryRoute(item, current)
      if (!current()) return
      if (path) router.push(path as never)
      else setError('Карточка недоступна. Нужна сеть и подтверждение её существования.')
    } catch { if (current()) setError('Карточка удалена, недоступна или не удалось проверить доступ. Повторите попытку при наличии сети.') }
    finally { lock.current = false; if (current()) setWorking(false) }
  }
  const creation = item.operation === 'create'
  const title = creation && item.entityType === 'event' ? `${terms.mode === 'orders' ? 'Создан' : 'Создано'} ${terms.label}` : (item.operation === 'update' && semanticLabels[item.semanticAction || '']) || item.summary || 'Изменение'
  const entityLabel = item.entityType === 'event' ? item.entityLabel.replace(/^Мероприятие(?=:|$)/, terms.labelCapitalized) : item.entityLabel
  return <Surface>
    <Pressable accessibilityRole="button" accessibilityLabel={`Изменения: ${entityLabel}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.header}>
      <View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.entity}>{entityLabel}</Text><Text style={styles.meta}>{new Date(item.occurredAt).toLocaleString('ru-RU')} · {item.actorLabel || 'Пользователь'} · {sourceLabels[item.source || ''] || item.source || 'Web'}</Text></View><Text style={styles.meta}>{open ? '−' : '+'}</Text>
    </Pressable>
    {open ? <View style={styles.changes}>
      {item.changes.length ? item.changes.map((change, index) => <View key={`${change.field}-${index}`} style={styles.change}><Text style={styles.label}>{change.label}</Text>{!creation ? <Text style={styles.meta}>Было: {historyValue(change.field, change.oldValue)}</Text> : null}<Text style={styles.entity}>{creation ? '' : 'Стало: '}{historyValue(change.field, change.newValue)}</Text></View>) : <Text style={styles.meta}>Подробные изменения отсутствуют</Text>}
      {item.entityExists ? <><Button title="Открыть карточку" variant="secondary" disabled={!navigationAllowed} loading={working} onPress={openEntity} />{!navigationAllowed ? <Text style={styles.meta}>Офлайн-копия не подтверждает доступность карточки. Обновите историю при наличии сети.</Text> : null}</> : <Text style={styles.meta}>Карточка отсутствует или недоступна</Text>}
      {error ? <Notice tone="danger" message={error} /> : null}
    </View> : null}
  </Surface>
}
const createStyles = (p: Palette) => StyleSheet.create({ header: { flexDirection: 'row', gap: 8, minHeight: 48 }, grow: { flex: 1, minWidth: 0 }, title: { color: p.cardTitle, fontSize: 14, fontWeight: '600' }, entity: { color: p.cardMeta, fontSize: 13, lineHeight: 19, marginTop: 3 }, meta: { color: p.cardMuted, fontSize: 12, lineHeight: 18, marginTop: 4 }, changes: { gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.border }, change: { gap: 4, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.border }, label: { color: p.text, fontSize: 12, fontWeight: '600' } })
