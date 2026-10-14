import { useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Button, CompactField, EmptyState, FilterControl, FilterOverlay, Notice, PageHeader, Screen, Surface } from '../src/shared/ui/components'
import { PeriodPicker } from '../src/shared/ui/PeriodPicker'
import { useTheme, useThemeStyles } from '../src/shared/ui/ThemeProvider'
import type { Palette } from '../src/shared/ui/theme'
import { useWorkItemTerminology } from '../src/shared/hooks/useWorkItemTerminology'
import { dateRangeError, fixedHistoryRoute } from '../src/features/history/filter'
import { HistoryRow, sourceLabels } from '../src/features/history/HistoryRow'
import { useHistory } from '../src/features/history/useHistory'

import { typography } from '../src/shared/ui/theme'
import { periodSummary } from '../src/shared/ui/periodPickerDates'

const operations = [['', 'Все действия'], ['create', 'Добавление'], ['update', 'Изменение'], ['delete', 'Удаление'], ['merge', 'Объединение']]
function HistoryChoice({ label, value, options, onSelect }: { label: string; value: string; options: string[][]; onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return <FilterOverlay title={`${label}: ${options.find(([key]) => key === value)?.[1] || value}`} visible={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} selected={Boolean(value)} options={options.map(([key, name]) => ({ value: key, label: name, selected: key === value }))} onSelect={(next) => { onSelect(next); setOpen(false) }} />
}
export default function HistoryScreen() {
  const viewport = useWindowDimensions()
  const terms = useWorkItemTerminology(); const { palette } = useTheme(); const styles = useThemeStyles(createStyles)
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>()
  const route = fixedHistoryRoute(params); const fixed = Boolean(route?.entityId)
  const [entityType, setEntityType] = useState(''); const [operation, setOperation] = useState(''); const [source, setSource] = useState(''); const [actorId, setActorId] = useState(''); const [search, setSearch] = useState(''); const [period, setPeriod] = useState({ from: '', to: '' }); const { from: dateFrom, to: dateTo } = period; const [filtersOpen, setFiltersOpen] = useState(false)
  const dateError = dateRangeError(dateFrom, dateTo)
  const filters = useMemo(() => ({ entityType: fixed ? route!.entityType : entityType, entityId: route?.entityId || '', operation, source, actorId, search: search.trim(), dateFrom, dateTo }), [fixed, route?.entityType, route?.entityId, entityType, operation, source, actorId, search, dateFrom, dateTo])
  const history = useHistory(filters, route !== null && !dateError)
  const actors = [['', 'Все авторы'], ...Array.from(new Map(history.items.filter((item) => item.actorId).map((item) => [item.actorId!, item.actorLabel || 'Пользователь'])).entries())]
  if (actorId && !actors.some(([value]) => value === actorId)) actors.push([actorId, 'Выбранный автор'])
  const entityOptions = [['', 'Все карточки'], ['event', terms.pluralCapitalized], ['client', 'Клиенты'], ['transaction', 'Финансы']]
  const summary = [!fixed && entityType ? entityOptions.find(([id]) => id === entityType)?.[1] : '', operation ? operations.find(([id]) => id === operation)?.[1] : '', source ? sourceLabels[source] || source : '', actorId ? actors.find(([id]) => id === actorId)?.[1] : '', search.trim() ? `Поиск: ${search.trim()}` : '', dateFrom || dateTo ? periodSummary(period) : ''].filter(Boolean)
  const active = summary.length > 0
  const reset = () => { setEntityType(''); setOperation(''); setSource(''); setActorId(''); setSearch(''); setPeriod({ from: '', to: '' }) }
  return <Screen scroll={false} contentStyle={styles.screen}><PageHeader title={fixed ? 'История карточки' : 'История действий'} count={history.items.length} />
    {route === null ? <Notice tone="danger" message="Некорректный адрес истории карточки. Откройте историю из доступной карточки." /> : <>
      <Surface variant="toolbar" style={styles.toolbar}><CompactField label="Поиск" search value={search} onChangeText={setSearch} placeholder="Карточка или пользователь" /><View style={styles.filterHeading}><FilterControl testID="history-filter-toggle" title="Фильтры" selected={active} expanded={filtersOpen} onPress={() => setFiltersOpen(!filtersOpen)} /><Text testID="history-filter-count" accessibilityLabel={`Активных фильтров: ${summary.length}`} style={styles.meta}>{summary.length}</Text></View><Text testID="history-filter-summary" numberOfLines={2} accessibilityLabel={summary.join(" · ") || "Вся доступная история"} style={styles.meta}>{summary.join(" · ") || "Вся доступная история"}</Text>{active ? <Button testID="history-reset" title="Сбросить фильтры" variant="secondary" onPress={reset} /> : null}
        {filtersOpen ? <ScrollView testID="history-filter-scroll" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ flexShrink: 1, maxHeight: Math.min(viewport.height * 0.34, 260) }} contentContainerStyle={styles.filterContent}><View style={styles.wrap}>{!fixed ? <HistoryChoice label="Карточки" value={entityType} options={[[ '', 'Все карточки'], ['event', terms.pluralCapitalized], ['client', 'Клиенты'], ['transaction', 'Финансы']]} onSelect={setEntityType} /> : null}<HistoryChoice label="Действия" value={operation} options={operations} onSelect={setOperation} /><HistoryChoice label="Источник" value={source} options={[[ '', 'Все источники'], ...Object.entries(sourceLabels)]} onSelect={setSource} /><HistoryChoice label="Автор" value={actorId} options={actors} onSelect={setActorId} /></View><PeriodPicker value={period} onChange={setPeriod} error={dateError} testID="history-period" /><Text style={styles.meta}>Начало — дата UTC; окончание — конец дня по времени устройства, как в PWA.</Text></ScrollView> : null}
      </Surface>
      <ScrollView testID="history-list-scroll" style={styles.listScroll} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
      {dateError && !filtersOpen ? <Notice tone="danger" message={dateError} /> : null}
      {history.offline ? <Notice tone="info" message="Показана последняя сохранённая история. Это неполная офлайн-копия, а не актуальный ответ сервера. Новые офлайн-действия появятся после синхронизации." /> : null}
      {history.warning ? <Notice tone="warning" message={history.warning} /> : null}
      {history.error ? <Notice tone="danger" message={history.error} /> : null}
      <View style={styles.list}>{history.items.map((item) => <HistoryRow key={item.id} item={item} navigationAllowed={history.navigationAllowed} />)}</View>
      {history.loading ? <ActivityIndicator accessibilityLabel="Загрузка истории" color={palette.primary} /> : null}
      {!history.loading && !dateError && !history.error && !history.items.length ? <EmptyState title={history.offline ? 'Сохранённой истории нет' : active ? 'По фильтрам ничего не найдено' : 'История пока пуста'} description={history.offline ? 'Подключитесь к сети и обновите историю.' : 'Новые действия появятся после изменения данных.'}  /> : null}
      {history.items.some((item) => item.legacy) ? <Notice tone="info" message="История до обновления могла сохраниться не полностью." /> : null}
      {history.pageError ? <Notice tone="danger" message={history.pageError} /> : null}
      {history.hasMore ? <Button title={history.pageError ? 'Повторить загрузку страницы' : 'Показать ещё'} variant="secondary" onPress={history.loadMore} loading={history.moreLoading} disabled={history.loading} /> : null}
      <Button title={history.error ? 'Повторить загрузку' : 'Обновить историю'} variant="secondary" onPress={history.reload} loading={history.loading} disabled={Boolean(dateError)} />
      </ScrollView>
    </>}
  </Screen>
}
const createStyles = (p: Palette) => StyleSheet.create({ screen: { padding: 12, paddingBottom: 12, gap: 8 }, toolbar: { flexShrink: 1, minHeight: 0 }, filterHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, filterContent: { gap: 12 }, listScroll: { flex: 1, minHeight: 80 }, listContent: { gap: 12, paddingBottom: 24 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, list: { gap: 8 }, meta: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 12, lineHeight: 18 } })
