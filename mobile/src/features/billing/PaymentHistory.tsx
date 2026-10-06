import { useCallback, useRef, useState } from 'react'
import { Linking, Text, View, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useScreenLifetime } from '../profile/useScreenLifetime'
import { Button, EmptyState, SectionTitle, Surface, StatusChip } from '../../shared/ui/components'
import { Notice } from '../../shared/ui/Notice'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { getPaymentPage, mergePayments, paymentCategories, paymentDate, paymentStatus, safeHttps, type PaymentCategory, type PaymentItem } from './history'
import { formatRubles } from './format'

export function PaymentHistory() {
  const styles = useThemeStyles(createStyles)
  const capture = useScreenLifetime()
  const [category, setCategory] = useState<PaymentCategory>('all')
  const [items, setItems] = useState<PaymentItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0), locked = useRef(false), seen = useRef(new Set<string>())
  const load = useCallback(async (next?: string) => {
    if (next && locked.current) return
    const revision = next ? generation.current : ++generation.current
    const current = capture()
    locked.current = true; setLoading(true); setError('')
    if (!next) { setItems([]); setCursor(null); setReady(false); seen.current.clear() }
    try {
      const page = await getPaymentPage(category, next)
      if (!current() || revision !== generation.current) return
      if (next) seen.current.add(next)
      const repeats = Boolean(page.cursor && (page.cursor === next || seen.current.has(page.cursor)))
      setItems((previous) => mergePayments(next ? previous : [], page.items))
      setReady(true); setCursor(repeats ? null : page.cursor)
      if (repeats) setError('Сервер повторил страницу. Обновите историю перед продолжением.')
    } catch { if (current() && revision === generation.current) setError('Не удалось загрузить историю операций') }
    finally { if (current() && revision === generation.current) { locked.current = false; setLoading(false) } }
  }, [category, capture])
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; locked.current = false } }, [load]))
  const openReceipt = async (url: string) => {
    const safe = safeHttps(url)
    if (!safe) return
    try { await Linking.openURL(safe) } catch { setError('Не удалось открыть чек') }
  }
  return <>
    <Surface><SectionTitle>История операций</SectionTitle><Text style={styles.meta}>Расчёты с сервисом: банковское зачисление и списание за тариф отображаются отдельно.</Text>
      <View style={styles.filters}>{paymentCategories.map(([key, title]) => <Button key={key} title={title} variant={category === key ? 'primary' : 'secondary'} onPress={() => setCategory(key)} />)}</View>
    </Surface>
    {error ? <><Notice tone="danger" message={error} /><Button title="Повторить загрузку истории" variant="secondary" onPress={() => void load()} disabled={loading} /></> : null}
    {loading ? <Notice message="Загружаем операции…" /> : null}
    {ready && !loading && !error && !items.length ? <EmptyState title="Операций пока нет" description={category === 'all' ? 'Здесь появятся оплаты тарифов, пополнения и бонусы.' : 'В выбранной категории операций пока нет.'} /> : null}
    {items.map((item) => <Surface key={item.id}>
      <View style={styles.row}><Text style={styles.title}>{item.title}</Text><StatusChip label={paymentStatus[item.status]} tone={item.status === 'succeeded' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'} /></View>
      {item.details ? <Text style={styles.text}>{item.details}</Text> : null}
      <Text style={styles.meta}>{[item.sourceTitle, item.methodTitle].filter(Boolean).join(' · ')}</Text>
      <Text style={styles.text}>{item.status === 'succeeded' ? item.direction === 'out' ? '−' : '+' : ''}{formatRubles(item.amount)}</Text>
      <Text style={styles.meta}>{paymentDate(item.occurredAt)}</Text>
      {item.receiptUrl ? <Button title="Посмотреть чек" variant="secondary" onPress={() => void openReceipt(item.receiptUrl)} /> : null}
    </Surface>)}
    {cursor ? <Button title="Показать более ранние" variant="secondary" onPress={() => void load(cursor)} loading={loading} /> : null}
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, title: { color: palette.text, fontSize: 15, fontWeight: '700', flexShrink: 1 }, text: { color: palette.text, fontSize: 14 }, meta: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } })
