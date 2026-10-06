import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import { Button, CompactField, EmptyState, FilterControl, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { calculateStatistics, categoryLabel, money, readStatistics, statisticsCsv, statisticsPath, type StatisticsStatus } from './statistics'
import { useSectionData } from './useSectionData'
import { shareStatisticsCsv } from './exportCsv'

const statuses: [StatisticsStatus, string][] = [['all', 'Все'], ['draft', 'Заявки'], ['active', 'Предстоящие'], ['finished', 'Прошедшие'], ['closed', 'Закрытые'], ['canceled', 'Отменённые']]
export function StatisticsSection() {
  const terms = useWorkItemTerminology()
  const { palette } = useTheme(); const styles = useThemeStyles(createStyles)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number | null>(currentYear)
  const [status, setStatus] = useState<StatisticsStatus>('all')
  const [town, setTown] = useState(''); const [townDraft, setTownDraft] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const query = statisticsPath({ year, town, status })
  const read = useCallback(async (signal: AbortSignal) => readStatistics(await api.get(query, { signal }), { year, town, status }), [query, year, town, status])
  const session = useSectionData(query, read)
  const exportLock = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null)
  useFocusEffect(useCallback(() => { setExporting(exportLock.current); setNotice(null) }, [session.key]))
  const data = session.data
  const analytics = data ? calculateStatistics(data) : null
  const exportCsv = async () => {
    const epoch = session.token()
    if (!data || session.loading || session.error || exportLock.current || !session.current(epoch)) return
    exportLock.current = true; setExporting(true); setNotice(null)
    try { await shareStatisticsCsv(statisticsCsv(data, terms.labelCapitalized), () => session.current(epoch)) }
    catch { if (session.current(epoch)) setNotice({ key: session.key, message: 'Не удалось экспортировать CSV. Повторите попытку.' }) }
    finally { exportLock.current = false; if (session.current(session.token())) setExporting(false) }
  }
  // The native promise may outlive focus; the ref still blocks a second share.
  const busy = exporting && exportLock.current
  return <>
    <Surface variant="toolbar">
      <FilterControl title={`Фильтры: ${year || 'все годы'} · ${statuses.find(([value]) => value === status)?.[1]}${town ? ` · ${town}` : ''}`} expanded={filtersOpen} onPress={() => setFiltersOpen(!filtersOpen)} />
      {filtersOpen ? <>
        <Text style={styles.meta}>Период</Text><View style={styles.wrap}>{[currentYear, currentYear - 1, currentYear - 2].map((value) => <FilterControl key={value} title={String(value)} selected={year === value} onPress={() => setYear(value)} />)}<FilterControl title="Все годы" selected={year === null} onPress={() => setYear(null)} /></View>
        <Text style={styles.meta}>Статус</Text><View style={styles.wrap}>{statuses.map(([value, label]) => <FilterControl key={value} title={label} selected={status === value} onPress={() => setStatus(value)} />)}</View>
        <CompactField label="Город" value={townDraft} onChangeText={setTownDraft} placeholder="Все города" />
        <Button title="Применить город" variant="secondary" onPress={() => setTown(townDraft.trim())} />
        {town ? <Button title="Сбросить город" variant="secondary" onPress={() => { setTown(''); setTownDraft('') }} /> : null}
      </> : null}
    </Surface>
    {session.loading ? <ActivityIndicator accessibilityLabel="Загрузка статистики" color={palette.primary} /> : null}
    {session.error ? <Notice tone="danger" message={session.error} /> : null}
    {data && analytics ? <>
      {!data.events.length && !data.transactions.length ? <EmptyState title="За выбранный период данных нет" description="Выберите другой год, статус или город." /> : null}
      <Surface variant="kpi"><Text style={styles.meta}>{terms.pluralCapitalized}: {data.events.length} · Транзакции: {data.transactions.length}</Text><SectionTitle>Финансовый результат</SectionTitle><Text testID="statistics-net" style={styles.total}>{money(analytics.net)}</Text><Text style={styles.income}>Доходы: {money(analytics.income)}</Text><Text style={styles.expense}>Расходы: {money(analytics.expense)}</Text><Text style={styles.text}>Маржа: {analytics.margin.toFixed(1)}%</Text><Text style={styles.meta}>Остатки к оплате: {money(analytics.paymentLeft)}</Text><Text style={styles.meta}>Налоги: {money(analytics.taxes)} · Комиссии: {money(analytics.commissions)}</Text></Surface>
      {analytics.topExpenses.length ? <Surface><SectionTitle>Основные расходы</SectionTitle>{analytics.topExpenses.map((item) => <View key={item.category} style={styles.row}><Text style={styles.grow}>{categoryLabel(item.category)}</Text><Text style={styles.text}>{money(item.amount)}</Text></View>)}</Surface> : null}
      {analytics.topEvents.length ? <Surface><SectionTitle>Самые прибыльные {terms.plural}</SectionTitle>{analytics.topEvents.map(({ event, profit }) => <Pressable key={event._id} accessibilityRole="button" accessibilityLabel={`Открыть: ${event.description || event.eventType || terms.label}`} style={styles.row} onPress={() => { if (/^[a-f\d]{24}$/i.test(event._id)) router.push(`/events/${event._id}` as never) }}><View style={styles.flex}><Text style={styles.text}>{event.description || event.eventType || terms.labelCapitalized}</Text><Text style={styles.meta}>{event.eventDate ? new Date(event.eventDate).toLocaleDateString('ru-RU') : 'Дата не указана'}</Text></View><Text style={profit >= 0 ? styles.income : styles.expense}>{money(profit)}</Text></Pressable>)}</Surface> : null}
      <Notice tone="info" message="Статистика получена для выбранных фильтров. API не передаёт способ оплаты: обязательства могут входить в суммы. Этот CSV содержит только выбранные данные." />
    </> : null}
    {notice?.key === session.key ? <Notice tone="danger" message={notice.message} /> : null}
    <Button title="Экспортировать CSV" onPress={exportCsv} loading={busy} disabled={!data || session.loading || Boolean(session.error)} />
    <Button title={session.error ? 'Повторить загрузку' : 'Обновить'} variant="secondary" onPress={session.load} loading={session.loading} disabled={busy} />
  </>
}
const createStyles = (p: Palette) => StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.border }, flex: { flex: 1, minWidth: 100 }, grow: { flex: 1, color: p.text, fontSize: 14 }, text: { color: p.text, fontSize: 14, lineHeight: 20 }, meta: { color: p.cardMuted, fontSize: 12, lineHeight: 18 }, total: { color: p.text, fontSize: 28, fontWeight: '700' }, income: { color: p.notice.success.text, fontSize: 14, fontWeight: '600' }, expense: { color: p.notice.danger.text, fontSize: 14, fontWeight: '600' } })
