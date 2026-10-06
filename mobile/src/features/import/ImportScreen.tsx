import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { runSync } from '../../shared/sync/syncEngine'
import { getSyncRunState } from '../../shared/sync/syncState'
import { getCachedEntity } from '../../shared/storage/cache'
import { Button, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { ImportController, type Confirmation, type RequestGate } from './ImportController'
import { changeJob, checkEvent, getJob, listJobs, uploadJob } from './fileImportApi'
import { pickImportFile } from './nativeFile'
import { activeJob, eligible, labels, safeJobProblem, validId } from './contract'
import { UploadStep } from './UploadStep'
import { RecordRow, ReviewStep } from './ReviewStep'
import { ApplyStep, quoteDescription } from './ApplyStep'
import { CalendarImportSection } from './CalendarImportSection'

export function ImportScreen() {
  const { user } = useAuth()
  const { jobId } = useLocalSearchParams<{ jobId?: string | string[] }>()
  const validRoute = jobId === undefined || validId(jobId)
  const routeId = typeof jobId === 'string' ? jobId : undefined
  const queryClient = useQueryClient(), navigation = useNavigation()
  const terms = useWorkItemTerminology(), { palette } = useTheme()
  const gate = useRef<RequestGate>({ owner: null })
  // The session user object changes when auth/profile is replaced; an old form
  // cannot publish into its replacement even for the same tenant.
  const controller = useMemo(() => new ImportController({
    list: listJobs, get: getJob, change: changeJob,
    upload: (file, note) => uploadJob(file, note), pick: pickImportFile,
    online: async () => { const n = await NetInfo.fetch(); return n.isConnected === true && n.isInternetReachable !== false },
    sync: async (current) => {
      if (!current()) return
      await runSync({ fullPull: true })
      if (!current()) return
      const result = await getSyncRunState()
      if (!current()) return
      if (!['success', 'attention'].includes(result.status) || !result.lastCompletedAt) throw new Error('SYNC_NOT_COMPLETED')
      if (!current()) return
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
      if (!current()) return
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
    },
    event: async (id, requireLocal) => {
      await checkEvent(id)
      if (requireLocal) { const cached = await getCachedEntity<{ _id: string }>('events', id); if (cached?._id !== id) throw new Error('LOCAL_EVENT_UNAVAILABLE') }
      return id
    },
    navigate: (id) => router.push(`/events/edit/${id}` as never),
  }, gate.current), [user, queryClient])
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const focused = useRef(false), allowLeave = useRef(false)
  useFocusEffect(useCallback(() => {
    focused.current = true; allowLeave.current = false
    let cancelled = false
    if (user?._id && validRoute) {
      if (routeId && controller.state.job?.id !== routeId && (controller.state.dirty || controller.state.note || controller.state.file)) {
        Alert.alert('Несохранённые изменения', 'Сменить импорт и потерять ответы и выбранный файл?', [
          { text: 'Остаться', style: 'cancel', onPress: () => { if (!cancelled && focused.current) controller.focus() } },
          { text: 'Сменить импорт', onPress: () => { if (!cancelled && focused.current) { controller.discardDraft(); controller.newFile(); controller.focus(routeId) } } },
        ])
      } else controller.focus(routeId)
    }
    return () => { cancelled = true; focused.current = false; controller.blur() }
    // Read mutable controller state at focus time; draft edits never restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, validRoute, routeId, user?._id]))
  useEffect(() => navigation.addListener('beforeRemove', (event: any) => {
    if (allowLeave.current || !(controller.state.dirty || controller.state.note || controller.state.file)) return
    event.preventDefault()
    const snapshot = controller.snapshot(), token = controller.token()
    Alert.alert('Несохранённые изменения', 'Ответы и выбранный файл не сохранены. Закрыть импорт?', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Закрыть без сохранения', onPress: () => { if (!focused.current || !controller.isCurrent(token) || snapshot !== controller.snapshot()) return; allowLeave.current = true; controller.blur(); navigation.dispatch(event.data.action) } },
    ])
  }), [controller, navigation])
  const ask = (confirmation: Confirmation) => {
    const job = controller.state.job
    if (!job) return
    Alert.alert(confirmation.action === 'stop' ? 'Запросить остановку?' : confirmation.action === 'release' ? 'Вернуть остаток резерва?' : 'Подтвердить расходы?',
      confirmation.action === 'stop' ? 'Текущий запрос может завершиться. Остановка подтверждается только статусом сервера.' : confirmation.action === 'release' ? 'Задание останется в списке. Сервер завершит возврат неиспользованного резерва.' : `${quoteDescription(job)} Текст файла будет передан провайдеру.`,
      [{ text: 'Отмена', style: 'cancel' }, { text: 'Подтвердить', onPress: () => { void controller.confirm(confirmation) } }])
  }
  const switchJob = (next: () => void) => {
    if (!(state.dirty || state.note || state.file)) { next(); return }
    const snapshot = controller.snapshot(), token = controller.token()
    Alert.alert('Несохранённые изменения', 'Сменить импорт без сохранения ответов и выбранного файла?', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Сменить импорт', onPress: () => { if (!focused.current || !controller.isCurrent(token) || snapshot !== controller.snapshot()) return; controller.discardDraft(); controller.newFile(); next() } },
    ])
  }
  const j = state.job, active = activeJob(j)
  const stage = active ? j?.status === 'analyzing' ? 1 : 3 : j?.status === 'quoted' && !state.dirty ? 2 : j && ['completed', 'paused'].includes(j.status) && !state.dirty ? 3 : 1
  if (!validRoute) return <Screen><PageHeader title="Импорт и экспорт" /><Notice tone="danger" message="Некорректный адрес импорта. Откройте раздел из меню." /></Screen>
  if (!user?._id) return <Screen><Notice tone="warning" message="Войдите в аккаунт для импорта." /></Screen>
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title="Импорт и экспорт" subtitle={`Импорт ${terms.pluralGenitive} из файла`} />
    <Surface variant="toolbar"><SectionTitle>Импорт · Из файла</SectionTitle><Button title="Открыть общий экспорт" variant="secondary" onPress={() => router.push('/more/export' as never)} /></Surface>
    <View accessibilityLabel="Этапы импорта" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{['Анализ и уточнения', 'Стоимость', 'Импорт'].map((label, index) => <View key={label} accessibilityLabel={`${index + 1}. ${label}${stage === index + 1 ? ', текущий этап' : ''}`} style={{ borderRadius: 24, borderWidth: 1, borderColor: palette.primary, backgroundColor: stage >= index + 1 ? palette.primary : palette.surface, padding: 8, minHeight: 40, flexShrink: 1 }}><Text style={{ color: stage >= index + 1 ? palette.onPrimary : palette.text }}>{index + 1}. {label}</Text></View>)}</View>
    {state.busy ? <ActivityIndicator accessibilityLabel="Запрос импорта" color={palette.primary} /> : null}
    {state.error ? <Notice tone="danger" message={state.error} /> : null}
    {state.notice ? <Notice tone="info" message={state.notice} /> : null}
    {state.cleanupError ? <Notice tone="warning" message="Не удалось удалить временную копию файла из кэша приложения. Физическая очистка не подтверждена." /> : null}
    {state.needsRead ? <Notice tone="warning" message="Нужно прочитать точное состояние задания. Повтор платного действия заблокирован." /> : null}
    <Button title="Прочитать состояние / повторить чтение" variant="secondary" onPress={controller.read} disabled={state.busy} />
    {!j && !state.needsRead ? <UploadStep controller={controller} state={state} /> : null}
    {j ? <>
      <Text style={{ color: palette.text, fontWeight: '600' }}>{j.fileName}</Text>
      {j.warnings.map((message, i) => <Notice key={i} tone="warning" message={message} />)}
      {j.note ? <Notice tone="neutral" message={`Пояснение к файлу: ${j.note}`} /> : null}
      {j.error ? <Notice tone="warning" message={safeJobProblem(j.error, 'Обработка остановилась с ошибкой. Прогресс сохранён. Проверьте ответы, смету, баланс, доступ тарифа и настройки ИИ перед продолжением.')} /> : null}
      <ApplyStep controller={controller} state={state} ask={ask} />
      {j.analysis && !active ? <ReviewStep controller={controller} state={state} /> : null}
      {j.records.map((record) => <RecordRow key={`${j.id}:${record.id}`} record={record} selected={state.draft.selectedIds.includes(record.id)} editable={!active && !state.busy && !state.denied && !state.needsRead && eligible(record)} toggle={() => controller.toggle(record.id)} open={() => { void controller.openEvent(record.id) }} />)}
      <Button title="Другой файл" variant="secondary" disabled={state.busy} onPress={() => switchJob(() => controller.newFile())} />
    </> : null}
    <Surface><SectionTitle>Сохранённые импорты</SectionTitle>
      {!state.listLoaded && !state.listError ? <Text style={{ color: palette.cardMuted }}>Загружаем список…</Text> : null}
      {state.listError ? <Notice tone="danger" message={state.listError} /> : null}
      {state.listLoaded && !state.listError && !state.jobs.length && !state.denied ? <EmptyState title="Сохранённых импортов пока нет" /> : null}
      <Button title="Обновить список импортов" onPress={controller.list} variant="secondary" disabled={state.busy} />
      {state.jobs.map((item) => <Button key={item.id} title={`${item.fileName} · ${labels[item.status]}`} variant="secondary" disabled={state.busy || state.denied} onPress={() => switchJob(() => { void controller.open(item.id) })} />)}
    </Surface>
    <CalendarImportSection />
  </Screen>
}
