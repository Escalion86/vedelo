import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'
import type { Call, Client, DocumentTemplate, Event, MobileSettings, Transaction } from '../../src/shared/domain/types'
import { api } from '../../src/shared/api/client'
import { ServicesSection } from '../../src/features/services/ServicesSection'
import { ListsSection } from '../../src/features/lists/ListsSection'
import { IntegrationsSection } from '../../src/features/integrations/IntegrationsSection'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import {
  decryptToTemporaryFile,
  deleteTemporaryDecryptedFile,
  encryptAndQueueFile,
  listEncryptedFiles,
  retryFileQueueNow,
  type EncryptedLocalFile,
} from '../../src/shared/storage/encryptedFiles'
import { runSync } from '../../src/shared/sync/syncEngine'
import {
  disableExpoPushNotifications,
  enableExpoPushNotifications,
  getExpoPushDeviceState,
} from '../../src/shared/notifications/useExpoPushNotifications'
import { Button, EmptyState, ErrorNotice, Field, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { useQueryClient } from '@tanstack/react-query'
import { MOBILE_SETTINGS_QUERY_KEY, useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

const titles: Record<string, [string, string]> = {
  calls: ['Звонки', 'Журнал IP-телефонии и результаты'], statistics: ['Статистика', 'Показатели по сохранённым данным'], services: ['Услуги', 'Прайс и группы услуг'], documents: ['Документы', 'Шаблоны, договоры и акты'], lists: ['Списки', 'Пользовательские справочники'], notifications: ['Уведомления', 'Push и напоминания'], integrations: ['Интеграции', 'Подключённые внешние сервисы'], referrals: ['Рефералы', 'Приглашения и вознаграждения'], settings: ['Настройки', 'Организация и термины'],
}

export default function MoreSectionScreen() {
  const { section = '' } = useLocalSearchParams<{ section: string }>()
  const [title, subtitle] = titles[section] || ['Раздел', 'Ведело']
  return <Screen><PageHeader title={title} subtitle={subtitle} />{section === 'calls' ? <Calls /> : section === 'statistics' ? <Statistics /> : section === 'services' ? <ServicesSection /> : section === 'referrals' ? <Referrals /> : section === 'integrations' ? <IntegrationsSection /> : section === 'notifications' ? <Notifications /> : section === 'documents' ? <Documents /> : section === 'settings' ? <Settings /> : <Lists />}</Screen>
}

const terminologyOptions = [
  ['auto', 'Авто', 'По сфере работы'],
  ['events', 'Мероприятия', 'Для артистов и event-сферы'],
  ['orders', 'Заказы', 'Для услуг, изделий и проектов'],
] as const

const Settings = () => {
  const terminology = useWorkItemTerminology()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = terminology.settings?.custom?.primaryEntityTerminology || 'auto'

  const save = async (value: 'auto' | 'events' | 'orders') => {
    setSaving(true)
    setError('')
    try {
      const response = await api.put<{ success: true; data: MobileSettings }>(
        '/mobile/v1/settings/terminology',
        { primaryEntityTerminology: value }
      )
      queryClient.setQueryData(MOBILE_SETTINGS_QUERY_KEY, response.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return <>{error ? <ErrorNotice message={error} /> : null}<Surface><SectionTitle>Как называть основную работу</SectionTitle><Text style={styles.muted}>Сейча в приложении: «{terminology.pluralCapitalized}».</Text>{terminologyOptions.map(([value, title, description]) => <Pressable key={value} disabled={saving} onPress={() => void save(value)} style={[styles.settingOption, selected === value && styles.settingOptionActive]}><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View><MaterialCommunityIcons name={selected === value ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={selected === value ? colors.primary : colors.textMuted} /></Pressable>)}</Surface></>
}

const Calls = () => {
  const [calls, setCalls] = useState<Call[]>([]); const [error, setError] = useState('')
  const clients = useCachedEntities<Client>('clients').data || []
  const load = async () => { setError(''); try { const response = await api.get<{ success: true; data: Call[] }>('/mobile/v1/calls?limit=80'); setCalls(response.data || []) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить звонки') } }
  useEffect(() => { load() }, [])
  return <>{error ? <ErrorNotice message={error} /> : null}{calls.length ? calls.map((call) => { const client = clients.find((item) => item._id === call.linkedClientId); const clientName = client ? [client.firstName, client.secondName].filter(Boolean).join(' ') : call.aiExtractedFields?.clientName; return <Pressable key={call._id} onPress={() => router.push(`/calls/${call._id}` as never)}><Surface><View style={styles.row}><View style={styles.round}><MaterialCommunityIcons name={call.direction === 'outgoing' ? 'phone-outgoing-outline' : 'phone-incoming-outline'} size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{clientName || call.phone || 'Неизвестный номер'}</Text><Text style={styles.muted}>{call.startedAt ? new Date(call.startedAt).toLocaleString('ru-RU') : ''}{call.durationSec ? ` · ${call.durationSec} сек.` : ''}</Text></View><StatusChip label={callStatusLabel(call.status)} tone={call.status === 'ready' || call.status === 'linked' ? 'success' : call.status === 'failed' ? 'danger' : 'neutral'} /><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></View>{call.aiSummary ? <Text style={styles.body} numberOfLines={3}>{call.aiSummary}</Text> : call.transcript ? <Text style={styles.body} numberOfLines={3}>{call.transcript}</Text> : null}</Surface></Pressable> }) : <EmptyState title="Нет звонков" description="Журнал появится после подключения IP-телефонии на доступном тарифе." />}<Button title="Обновить" variant="secondary" onPress={load} /></>
}

type StatisticsPayload = {
  events: Event[]
  clients: Client[]
  transactions: Transaction[]
}

type StatisticsStatus = 'all' | 'draft' | 'active' | 'finished' | 'closed' | 'canceled'

const statisticsStatuses: Array<[StatisticsStatus, string]> = [
  ['all', 'Все'],
  ['draft', 'Заявки'],
  ['active', 'Предстоящие'],
  ['finished', 'Прошедшие'],
  ['closed', 'Закрытые'],
  ['canceled', 'Отменённые'],
]

const Statistics = () => {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number | null>(currentYear)
  const [status, setStatus] = useState<StatisticsStatus>('all')
  const [town, setTown] = useState('')
  const [townDraft, setTownDraft] = useState('')
  const [data, setData] = useState<StatisticsPayload>({ events: [], clients: [], transactions: [] })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ status })
      if (year) query.set('year', String(year))
      if (town) query.set('town', town)
      const response = await api.get<{ success: true; data: StatisticsPayload }>(
        `/mobile/v1/statistics?${query.toString()}`
      )
      setData(response.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить статистику')
    } finally {
      setLoading(false)
    }
  }, [status, town, year])

  useEffect(() => { void load() }, [load])

  const analytics = useMemo(() => {
    const eventFinance = new Map<string, { income: number; expense: number }>()
    data.events.forEach((event) => eventFinance.set(event._id, { income: 0, expense: 0 }))
    let income = 0
    let expense = 0
    let taxes = 0
    let commissions = 0
    const expensesByCategory = new Map<string, number>()
    data.transactions.forEach((transaction) => {
      const amount = Number(transaction.amount || 0)
      if (transaction.type === 'income') income += amount
      if (transaction.type === 'expense') {
        expense += amount
        if (transaction.category === 'taxes') taxes += amount
        if (transaction.category === 'referral_out' || transaction.category === 'organizer') commissions += amount
        const category = transaction.category || 'other'
        expensesByCategory.set(category, (expensesByCategory.get(category) || 0) + amount)
      }
      const finance = transaction.eventId ? eventFinance.get(transaction.eventId) : null
      if (finance) finance[transaction.type] += amount
    })
    const paymentLeft = data.events.reduce((sum, event) => {
      const paid = eventFinance.get(event._id)?.income || 0
      return sum + Math.max(Number(event.contractSum || 0) - paid, 0)
    }, 0)
    const topExpenses = Array.from(expensesByCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
    const topEvents = data.events
      .map((event) => {
        const finance = eventFinance.get(event._id) || { income: 0, expense: 0 }
        return { event, profit: finance.income - finance.expense }
      })
      .sort((left, right) => right.profit - left.profit)
      .slice(0, 5)
    return {
      income,
      expense,
      taxes,
      commissions,
      net: income - expense,
      margin: income > 0 ? ((income - expense) / income) * 100 : 0,
      paymentLeft,
      topExpenses,
      topEvents,
      eventFinance,
    }
  }, [data.events, data.transactions])

  const exportCsv = async () => {
    setExporting(true)
    setError('')
    let destination: File | null = null
    try {
      const clientNames = new Map(data.clients.map((client) => [
        client._id,
        [client.firstName, client.secondName].filter(Boolean).join(' '),
      ]))
      const rows = [
        ['Тип', 'ID', 'Дата', 'Клиент', 'Статус/категория', 'Сумма', 'Доход', 'Расход', 'Комментарий'],
        ...data.events.map((event) => {
          const finance = analytics.eventFinance.get(event._id) || { income: 0, expense: 0 }
          return ['Мероприятие', event._id, event.eventDate || '', clientNames.get(event.clientId || '') || '', event.status, event.contractSum || 0, finance.income, finance.expense, event.description || '']
        }),
        ...data.transactions.map((transaction) => ['Транзакция', transaction._id, transaction.date || '', clientNames.get(transaction.clientId || '') || '', transaction.category || transaction.type, transaction.amount, transaction.type === 'income' ? transaction.amount : 0, transaction.type === 'expense' ? transaction.amount : 0, transaction.comment || '']),
      ]
      const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
      destination = new File(Paths.cache, `artistcrm-statistics-${year || 'all'}.csv`)
      destination.create({ overwrite: true, intermediates: true })
      destination.write(csv)
      await Sharing.shareAsync(destination.uri, { mimeType: 'text/csv', dialogTitle: 'Экспорт статистики Ведело' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось экспортировать CSV')
    } finally {
      if (destination?.exists) destination.delete()
      setExporting(false)
    }
  }

  return <>
    <Surface>
      <SectionTitle>Фильтры</SectionTitle>
      <View style={styles.filterWrap}>{[currentYear, currentYear - 1, currentYear - 2].map((item) => <FilterChip key={item} label={String(item)} active={year === item} onPress={() => setYear(item)} />)}<FilterChip label="Все годы" active={year === null} onPress={() => setYear(null)} /></View>
      <View style={styles.filterWrap}>{statisticsStatuses.map(([value, label]) => <FilterChip key={value} label={label} active={status === value} onPress={() => setStatus(value)} />)}</View>
      <Field label="Город" value={townDraft} onChangeText={setTownDraft} placeholder="Все города" />
      <Button title="Применить город" variant="secondary" onPress={() => setTown(townDraft.trim())} disabled={loading} />
      {town ? <Button title={`Сбросить город: ${town}`} variant="secondary" onPress={() => { setTown(''); setTownDraft('') }} disabled={loading} /> : null}
    </Surface>
    {error ? <ErrorNotice message={error} /> : null}
    <View style={styles.metrics}><Metric label="Мероприятия" value={data.events.length} /><Metric label="Транзакции" value={data.transactions.length} /><Metric label="Маржа %" value={Number(analytics.margin.toFixed(1))} /></View>
    <Surface><SectionTitle>Финансовый результат</SectionTitle><Text style={styles.bigMoney}>{money(analytics.net)}</Text><View style={styles.split}><Text style={styles.success}>Доходы {money(analytics.income)}</Text><Text style={styles.danger}>Расходы {money(analytics.expense)}</Text></View><Text style={styles.muted}>Остатки к оплате: {money(analytics.paymentLeft)} · налоги: {money(analytics.taxes)} · комиссии: {money(analytics.commissions)}</Text></Surface>
    {analytics.topExpenses.length ? <Surface><SectionTitle>Основные расходы</SectionTitle>{analytics.topExpenses.map((item) => <View key={item.category} style={styles.listRow}><Text style={styles.grow}>{transactionCategoryLabel(item.category)}</Text><Text style={styles.price}>{money(item.amount)}</Text></View>)}</Surface> : null}
    {analytics.topEvents.length ? <Surface><SectionTitle>Самые прибыльные мероприятия</SectionTitle>{analytics.topEvents.map(({ event, profit }) => <Pressable key={event._id} style={styles.listRow} onPress={() => router.push(`/events/${event._id}` as never)}><View style={styles.grow}><Text style={styles.title}>{event.description || event.eventType || 'Мероприятие'}</Text><Text style={styles.muted}>{event.eventDate ? new Date(event.eventDate).toLocaleDateString('ru-RU') : 'Дата не указана'}</Text></View><Text style={profit >= 0 ? styles.success : styles.danger}>{money(profit)}</Text></Pressable>)}</Surface> : null}
    <Button title="Экспортировать CSV" onPress={exportCsv} loading={exporting} disabled={loading} />
    <Button title="Обновить" variant="secondary" onPress={load} loading={loading} disabled={exporting} />
  </>
}

const Referrals = () => { const [data, setData] = useState<{ referralsCount: number; rewardsTotal: number; referrals: Array<{ _id?: string; name?: string; firstName?: string; createdAt?: string }> } | null>(null); const [error, setError] = useState(''); useEffect(() => { api.get<{ success: true; data: NonNullable<typeof data> }>('/mobile/v1/referrals').then((response) => setData(response.data)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Ошибка загрузки')) }, []); return <>{error ? <ErrorNotice message={error} /> : null}<View style={styles.metrics}><Metric label="Приглашено" value={data?.referralsCount || 0} /><Metric label="Начислено ₽" value={data?.rewardsTotal || 0} /></View>{data?.referrals?.map((item, index) => <Surface key={item._id || index}><Text style={styles.title}>{item.name || item.firstName || 'Пользователь Ведело'}</Text><Text style={styles.muted}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('ru-RU') : ''}</Text></Surface>)}</> }

type NotificationSettings = {
  remindersEnabled: boolean
  reminderTime: string
  pushConfigured: boolean
  deviceSubscribed: boolean
  activeDeviceCount: number
  timeZone: string
}

const Notifications = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [permission, setPermission] = useState('undetermined')
  const [localEnabled, setLocalEnabled] = useState(false)
  const [time, setTime] = useState('10:00')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [response, device] = await Promise.all([
        api.get<{ success: true; data: NotificationSettings }>('/mobile/v1/notifications'),
        getExpoPushDeviceState(),
      ])
      setSettings(response.data)
      setTime(response.data.reminderTime)
      setPermission(device.permission)
      setLocalEnabled(device.enabled && device.subscribed && response.data.deviceSubscribed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить настройки уведомлений')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const enable = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const result = await enableExpoPushNotifications()
      if (!result.ok) throw new Error(result.error)
      await api.patch('/mobile/v1/notifications', { pushConfigured: true })
      setMessage('Push-уведомления включены на этом устройстве')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось включить push')
      const device = await getExpoPushDeviceState().catch(() => null)
      if (device) setPermission(device.permission)
    } finally { setLoading(false) }
  }
  const disable = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const result = await disableExpoPushNotifications()
      setMessage(result.pending
        ? 'Push отключён локально. Серверная отписка завершится после восстановления сети.'
        : 'Push-уведомления отключены на этом устройстве')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить push')
    } finally { setLoading(false) }
  }
  const toggleReminders = async () => {
    if (!settings) return
    setLoading(true); setError(''); setMessage('')
    try {
      const response = await api.patch<{ success: true; data: NotificationSettings }>(
        '/mobile/v1/notifications',
        { remindersEnabled: !settings.remindersEnabled }
      )
      setSettings(response.data)
      setMessage(response.data.remindersEnabled ? 'Ежедневные напоминания включены' : 'Ежедневные напоминания отключены')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройку')
    } finally { setLoading(false) }
  }
  const saveTime = async (nextTime = time) => {
    setLoading(true); setError(''); setMessage('')
    try {
      const response = await api.patch<{ success: true; data: NotificationSettings }>(
        '/mobile/v1/notifications',
        { reminderTime: nextTime }
      )
      setSettings(response.data); setTime(response.data.reminderTime)
      setMessage(`Время напоминаний: ${response.data.reminderTime}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить время')
    } finally { setLoading(false) }
  }
  const sendTest = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      const response = await api.post<{ success: true; data: { sent: number } }>('/mobile/v1/notifications/test')
      setMessage(`Тест отправлен на ${response.data.sent} активн. устройств`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить тест')
    } finally { setLoading(false) }
  }

  return <>
    {error ? <ErrorNotice message={error} /> : null}
    {message ? <Surface><Text style={styles.success}>{message}</Text></Surface> : null}
    <Surface><SectionTitle>Push на этом устройстве</SectionTitle><IntegrationState icon="bell-ring-outline" title="Android push" description={`Разрешение: ${permission === 'granted' ? 'выдано' : permission === 'denied' ? 'запрещено' : 'не запрошено'}`} label={localEnabled ? 'Включено' : 'Отключено'} tone={localEnabled ? 'success' : 'neutral'} />{localEnabled ? <Button title="Отключить на этом устройстве" variant="secondary" onPress={disable} loading={loading} /> : <Button title="Включить push" onPress={enable} loading={loading} />}{permission === 'denied' ? <Button title="Открыть настройки Android" variant="secondary" onPress={() => Linking.openSettings()} disabled={loading} /> : null}<Button title="Отправить тест" variant="secondary" onPress={sendTest} disabled={!localEnabled || loading} /><Text style={styles.muted}>Активных Android-устройств: {settings?.activeDeviceCount || 0}. Отключение действует только для текущего устройства.</Text></Surface>
    <Surface><SectionTitle>Ежедневная сводка</SectionTitle><IntegrationState icon="calendar-clock" title="Мероприятия и контакты" description={`Часовой пояс: ${settings?.timeZone || 'Asia/Krasnoyarsk'}`} label={settings?.remindersEnabled ? 'Включена' : 'Отключена'} tone={settings?.remindersEnabled ? 'success' : 'neutral'} /><Button title={settings?.remindersEnabled ? 'Отключить ежедневную сводку' : 'Включить ежедневную сводку'} variant="secondary" onPress={toggleReminders} disabled={!settings || loading} /><Field label="Время, шаг 15 минут" value={time} onChangeText={setTime} placeholder="10:00" keyboardType="numbers-and-punctuation" maxLength={5} /><View style={styles.filterWrap}>{['08:00', '10:00', '12:00', '18:00'].map((item) => <FilterChip key={item} label={item} active={time === item} onPress={() => { setTime(item); void saveTime(item) }} />)}</View><Button title="Сохранить время" onPress={() => saveTime()} loading={loading} /></Surface>
    <Surface><Integration icon="gesture-tap-button" title="Быстрые действия" description="Из уведомления можно выполнить задачу либо перенести её на завтра или на три дня." /><Integration icon="shield-check-outline" title="Явное согласие" description="Приложение не запрашивает разрешение и не регистрирует push до нажатия «Включить push»." /></Surface>
  </>
}
const Documents = () => {
  const [files, setFiles] = useState<EncryptedLocalFile[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const load = () => listEncryptedFiles().then(setFiles).catch(() => undefined)
  const loadTemplates = useCallback(async () => {
    try {
      const response = await api.get<{ success: true; data: DocumentTemplate[] }>(
        '/mobile/v1/document-templates'
      )
      setTemplates(response.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить шаблоны')
    }
  }, [])
  useEffect(() => { load() }, [])
  useFocusEffect(useCallback(() => { void loadTemplates() }, [loadTemplates]))
  const pick = async () => {
    setError('')
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      await encryptAndQueueFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      })
      await load()
      setSyncing(true)
      await runSync()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось добавить файл')
    } finally {
      setSyncing(false)
    }
  }
  const sync = async () => {
    setSyncing(true)
    setError('')
    try {
      await retryFileQueueNow()
      await runSync()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось синхронизировать файлы')
    } finally {
      setSyncing(false)
    }
  }
  const share = async (file: EncryptedLocalFile) => {
    let uri = ''
    try {
      uri = await decryptToTemporaryFile(file)
      await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: file.name })
    } finally {
      if (uri) await deleteTemporaryDecryptedFile(uri).catch(() => undefined)
    }
  }
  const shareTemplate = async (template: DocumentTemplate) => {
    setSyncing(true)
    setError('')
    let destination: File | null = null
    try {
      const content = await api.download(
        `/mobile/v1/document-templates/${encodeURIComponent(template.id)}`
      )
      const safeName = template.fileName.replace(/[\\/:*?"<>|]/g, '_')
      destination = new File(Paths.cache, `${template.id}-${safeName}`)
      destination.create({ overwrite: true, intermediates: true })
      destination.write(new Uint8Array(content))
      await Sharing.shareAsync(destination.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dialogTitle: template.name,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось скачать шаблон')
    } finally {
      if (destination?.exists) destination.delete()
      setSyncing(false)
    }
  }
  const statusLabel = (status: string) => ({ pending: 'Ожидает отправки', uploading: 'Отправляется', failed: 'Ошибка отправки', synced: 'Синхронизирован' }[status] || status)
  return <>{error ? <ErrorNotice message={error} /> : null}<Surface><SectionTitle>DOCX-шаблоны</SectionTitle><Text style={styles.muted}>Шаблоны доступны только online и не сохраняются целиком в мобильном кэше.</Text>{templates.length ? templates.map((template) => <View key={template.id} style={styles.file}><MaterialCommunityIcons name="file-word-outline" size={23} color={colors.primary} /><Pressable style={styles.grow} onPress={() => router.push(`/more/documents/template/${template.id}` as never)}><Text style={styles.title}>{template.name}</Text><Text style={styles.muted}>{template.fileName}{template.size ? ` · ${Math.max(1, Math.round(template.size / 1024))} КБ` : ''}</Text></Pressable><Pressable hitSlop={10} onPress={() => shareTemplate(template)} disabled={syncing}><MaterialCommunityIcons name="share-variant-outline" size={22} color={colors.primary} /></Pressable><Pressable hitSlop={10} onPress={() => router.push(`/more/documents/template/${template.id}` as never)}><MaterialCommunityIcons name="pencil-outline" size={22} color={colors.textMuted} /></Pressable></View>) : <Text style={styles.muted}>Шаблоны ещё не добавлены.</Text>}<Button title="Добавить DOCX-шаблон" onPress={() => router.push('/more/documents/template/new' as never)} disabled={syncing} /></Surface><Surface><Integration icon="shield-lock-outline" title="Локальные вложения" description="Файлы шифруются AES-256-GCM до записи в закрытый каталог приложения; ключ хранится в Android Keystore." />{files.map((file) => <Pressable key={file.id} style={styles.file} onPress={() => share(file)}><MaterialCommunityIcons name="file-document-outline" size={23} color={colors.primary} /><View style={styles.grow}><Text style={styles.title}>{file.name}</Text><Text style={styles.muted}>{Math.max(1, Math.round(file.size / 1024))} КБ · {statusLabel(file.status)}</Text>{file.lastError ? <Text style={styles.danger}>{file.lastError}</Text> : null}</View><StatusChip label={statusLabel(file.status)} tone={file.status === 'synced' ? 'success' : file.status === 'failed' ? 'danger' : 'warning'} /></Pressable>)}</Surface><Button title="Добавить вложение до 5 МБ" loading={syncing} onPress={pick} />{files.some((file) => file.status === 'pending' || file.status === 'failed') ? <Button title="Повторить отправку" variant="secondary" loading={syncing} onPress={sync} /> : null}<Surface><Integration icon="file-cog-outline" title="Генерация документов" description="Договор и акт формируются на сервере из карточки мероприятия при подключении к сети; готовый DOCX можно скачать и отправить через Android." /></Surface></>
}
const Lists = () => <ListsSection />
const Integration = ({ icon, title, description }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; description: string }) => <View style={styles.integration}><View style={styles.round}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View></View>
const IntegrationState = ({ icon, title, description, label, tone }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; description: string; label: string; tone: 'neutral' | 'success' | 'warning' }) => <View style={styles.integration}><View style={styles.round}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View><StatusChip label={label} tone={tone} /></View>
const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => <Pressable style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}><Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text></Pressable>
const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`
const csvCell = (value: unknown) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  return text.includes(';') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text
}
const transactionCategoryLabel = (category: string) => ({ taxes: 'Налоги', referral_out: 'Реферальные выплаты', organizer: 'Комиссия организатора', services: 'Услуги и подрядчики', transport: 'Транспорт', advertising: 'Реклама', other: 'Прочее' }[category] || category)
const callStatusLabel = (status?: Call['status']) => ({ new: 'Новый', processing: 'Обработка', ready: 'Готов', linked: 'Связан', ignored: 'Пропущен', failed: 'Ошибка' }[status || 'new'] || 'Новый')
const Metric = ({ label, value }: { label: string; value: number }) => <View style={styles.metric}><Text style={styles.metricValue}>{new Intl.NumberFormat('ru-RU').format(value)}</Text><Text style={styles.metricLabel}>{label}</Text></View>
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, grow: { flex: 1 }, round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, title: { color: colors.text, fontSize: 14, fontWeight: '700' }, muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 }, body: { color: colors.text, fontSize: 13, lineHeight: 19 }, metrics: { flexDirection: 'row', gap: spacing.sm }, metric: { flex: 1, minHeight: 86, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.md, justifyContent: 'space-between' }, metricValue: { color: colors.text, fontSize: 21, fontWeight: '800' }, metricLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, bigMoney: { color: colors.text, fontSize: 30, fontWeight: '800' }, split: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, success: { color: colors.success, fontSize: 12, fontWeight: '700' }, danger: { color: colors.danger, fontSize: 12, fontWeight: '700' }, price: { color: colors.text, fontSize: 14, fontWeight: '800' }, integration: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, file: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, filterChipActive: { backgroundColor: colors.primary }, filterChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, filterChipTextActive: { color: '#FFFFFF' }, listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, settingOption: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, settingOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft } })
