import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { Button, EmptyState, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { ExportController } from './ExportController'
import { loadExportData } from './exportApi'
import { shareExportCsv } from './exportNative'
import { buildExportDatasets, exportKeys, unavailableColumns, type ExportKey } from './exportDatasets'

export function ExportSection() {
  const { user } = useAuth(), terms = useWorkItemTerminology(), { palette } = useTheme()
  const [selected, setSelected] = useState<ExportKey[]>([...exportKeys])
  const controller = useMemo(() => new ExportController({
    online: async () => { const n = await NetInfo.fetch(); return n.isConnected === true && n.isInternetReachable !== false },
    load: loadExportData, share: shareExportCsv,
    next: (key, current) => new Promise(resolve => {
      if (!current()) { resolve(false); return }
      const label = { events: 'Работы', requests: 'Заявки', transactions: 'Транзакции' }[key]
      let resolved = false
      const finish = (value: boolean) => { if (!resolved) { resolved = true; resolve(value && current()) } }
      Alert.alert('Следующий CSV?', `Передача предыдущего файла не подтверждена. Открыть файл «${label}»?`, [
        { text: 'Остановить', style: 'cancel', onPress: () => finish(false) },
        { text: 'Открыть', onPress: () => finish(true) },
      ], { cancelable: true, onDismiss: () => finish(false) })
    }),
  }), [])
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot)
  useFocusEffect(useCallback(() => { controller.focus(user?._id ? user : null); setSelected([...exportKeys]); return controller.blur }, [controller, user]))
  const visible = state.owner === user, data = visible ? state.data : null
  const datasets = useMemo(() => data ? buildExportDatasets(data, terms) : null, [data, terms.genitive, terms.instrumental, terms.labelCapitalized])
  const missing = datasets ? unavailableColumns(datasets, selected) : []
  const empty = datasets && selected.length > 0 && selected.every(key => datasets[key].rows.length === 0)
  if (!user?._id) return <Notice tone="warning" message="Войдите в аккаунт для экспорта." />
  return <Surface>
    <SectionTitle>Общий экспорт в CSV</SectionTitle>
    <Text style={{ color: palette.cardMuted }}>Все серверные данные без фильтров по году и городу. Локальные изменения, которые ещё не синхронизированы, не включаются. Нужен тариф с доступом к статистике.</Text>
    <Notice tone="info" message="Как в web-экспорте, доход, расход и прибыль включают транзакции-обязательства. Эти суммы не являются только фактическими оплатами." />
    {exportKeys.map(key => {
      const label = { events: `${terms.pluralCapitalized} (без заявок)`, requests: 'Заявки (draft)', transactions: 'Транзакции' }[key]
      const checked = selected.includes(key)
      return <Pressable key={key} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: state.sharing }} disabled={state.sharing} onPress={() => setSelected(old => old.includes(key) ? old.filter(k => k !== key) : [...old, key])} style={{ paddingVertical: 12, minHeight: 44 }}>
        <Text style={{ color: checked ? palette.text : palette.cardMuted }}>{checked ? '☑' : '☐'} {label}{datasets ? ` · ${datasets[key].rows.length}` : ''}</Text>
      </Pressable>
    })}
    {!visible || state.loading ? <ActivityIndicator color={palette.primary} accessibilityLabel="Загружаем полный серверный набор" /> : null}
    {visible && state.error ? <Notice tone="danger" message={state.error} /> : null}
    {visible && state.error.includes('Нужен тариф') ? <Button title="Выбрать тариф" variant="secondary" onPress={() => router.push('/billing' as never)} /> : null}
    {missing.length ? <Notice tone="warning" message={`API не передал часть полей: ${missing.join(', ')}. В соответствующих ячейках указано «Недоступно».`} /> : null}
    {empty ? <EmptyState title="Выбранные наборы пусты" description="Сервер вернул полный набор без записей. Можно передать CSV с заголовками." /> : null}
    {visible && state.notice ? <Notice tone="neutral" message={state.notice} /> : null}
    {state.cleanupFailed ? <Notice tone="warning" message="Не удалось удалить временный CSV из кэша приложения. Физическая очистка не подтверждена." /> : null}
    <Button title="Обновить данные для экспорта" variant="secondary" onPress={controller.load} disabled={state.loading || state.sharing} />
    <Button title="Экспортировать выбранные CSV" onPress={() => { void controller.export(selected, terms) }} loading={state.sharing} disabled={!selected.length || state.loading || !data} />
  </Surface>
}
