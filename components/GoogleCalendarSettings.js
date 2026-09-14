'use client'

import { useEffect, useState } from 'react'
import IconCheckBox from '@components/IconCheckBox'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import NativeSelect from '@components/NativeSelect'
import { toNormalizedNumber } from '@helpers/numberInput'
import { shouldSaveGoogleCalendarSettingsBeforeSync } from '@helpers/googleCalendarSettingsState'
import { faSpinner, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { reachGoalOnce } from '@helpers/metrikaGoals'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const DEFAULT_CALENDAR_REMINDERS = Object.freeze({
  useDefault: false,
  overrides: [
    { method: 'popup', minutes: 60 },
    { method: 'popup', minutes: 24 * 60 },
  ],
})

const DEFAULT_STATUS_COLORS = Object.freeze({
  draft: '8',
  active: '9',
  canceled: '11',
  closed: '10',
})

const DEFAULT_SYNC_SETTINGS = Object.freeze({
  titleMode: 'eventType_services',
  showDescription: true,
  showClient: true,
  showOtherContacts: true,
  showColleague: true,
  showContractSum: true,
  showFinanceComment: true,
  showTransactions: true,
  showAdditionalEvents: true,
  showNavigationLinks: true,
  showEventLink: true,
  showStatusIcons: true,
})

const TITLE_MODE_OPTIONS = Object.freeze([
  { value: 'eventType_services', name: 'Что за событие + услуги' },
  { value: 'services_eventType', name: 'Услуги + что за событие' },
  { value: 'eventType', name: 'Только что за событие' },
  { value: 'services', name: 'Только услуги' },
  { value: 'eventTitle', name: 'Название мероприятия' },
  { value: 'client_eventType', name: 'Клиент + что за событие' },
])

const SYNC_FIELD_OPTIONS = Object.freeze([
  { key: 'showDescription', label: 'Комментарий/описание мероприятия' },
  { key: 'showClient', label: 'Клиент и контакты клиента' },
  { key: 'showOtherContacts', label: 'Прочие контакты' },
  { key: 'showColleague', label: 'Коллега, если мероприятие передано' },
  { key: 'showContractSum', label: 'Договорная сумма' },
  { key: 'showFinanceComment', label: 'Комментарий по финансам' },
  { key: 'showTransactions', label: 'Транзакции по мероприятию' },
  { key: 'showAdditionalEvents', label: 'Задачи/События и напоминания' },
  { key: 'showNavigationLinks', label: 'Ссылки навигации по адресу' },
  { key: 'showEventLink', label: 'Ссылка на мероприятие в CRM' },
])

const STATUS_COLOR_OPTIONS = Object.freeze([
  { value: '1', name: 'Лаванда', bg: '#a4bdfc', text: '#172554' },
  { value: '2', name: 'Шалфей', bg: '#7ae7bf', text: '#064e3b' },
  { value: '3', name: 'Виноград', bg: '#dbadff', text: '#581c87' },
  { value: '4', name: 'Фламинго', bg: '#ff887c', text: '#7f1d1d' },
  { value: '5', name: 'Банан', bg: '#fbd75b', text: '#713f12' },
  { value: '6', name: 'Мандарин', bg: '#ffb878', text: '#7c2d12' },
  { value: '7', name: 'Павлин', bg: '#46d6db', text: '#164e63' },
  { value: '8', name: 'Графит', bg: '#e1e1e1', text: '#1f2937' },
  { value: '9', name: 'Черника', bg: '#5484ed', text: '#ffffff' },
  { value: '10', name: 'Базилик', bg: '#51b749', text: '#ffffff' },
  { value: '11', name: 'Томат', bg: '#dc2127', text: '#ffffff' },
])

const STATUS_COLOR_FIELDS = Object.freeze([
  { key: 'draft', label: 'Заявка' },
  { key: 'active', label: 'Подтверждено' },
  { key: 'canceled', label: 'Отменено' },
  { key: 'closed', label: 'Закрыто' },
])

const normalizeReminders = (value) => {
  if (!value || typeof value !== 'object') return DEFAULT_CALENDAR_REMINDERS
  const useDefault = Boolean(value.useDefault)
  const overrides = Array.isArray(value.overrides)
    ? value.overrides
        .filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item.method === 'email' || item.method === 'popup') &&
            Number.isFinite(Number(item.minutes)) &&
            Number(item.minutes) > 0
        )
        .map((item) => ({
          method: item.method,
          minutes: Number(item.minutes),
        }))
    : []
  return {
    useDefault,
    overrides:
      overrides.length > 0 ? overrides : DEFAULT_CALENDAR_REMINDERS.overrides,
  }
}

const normalizeStatusColors = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const normalizeColor = (color, fallback) => {
    const prepared = String(color ?? '').trim()
    return /^(?:[1-9]|1[0-1])$/.test(prepared) ? prepared : fallback
  }
  return {
    draft: normalizeColor(source.draft, DEFAULT_STATUS_COLORS.draft),
    active: normalizeColor(source.active, DEFAULT_STATUS_COLORS.active),
    canceled: normalizeColor(source.canceled, DEFAULT_STATUS_COLORS.canceled),
    closed: normalizeColor(source.closed, DEFAULT_STATUS_COLORS.closed),
  }
}

const normalizeSyncSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const allowedTitleModes = new Set(
    TITLE_MODE_OPTIONS.map((item) => item.value)
  )
  const boolValue = (key) => Boolean(source[key] ?? DEFAULT_SYNC_SETTINGS[key])
  return {
    titleMode: allowedTitleModes.has(source.titleMode)
      ? source.titleMode
      : DEFAULT_SYNC_SETTINGS.titleMode,
    showDescription: boolValue('showDescription'),
    showClient: boolValue('showClient'),
    showOtherContacts: boolValue('showOtherContacts'),
    showColleague: boolValue('showColleague'),
    showContractSum: boolValue('showContractSum'),
    showFinanceComment: boolValue('showFinanceComment'),
    showTransactions: boolValue('showTransactions'),
    showAdditionalEvents: boolValue('showAdditionalEvents'),
    showNavigationLinks: boolValue('showNavigationLinks'),
    showEventLink: boolValue('showEventLink'),
    showStatusIcons: boolValue('showStatusIcons'),
  }
}

const serializeReminders = (value) => JSON.stringify(normalizeReminders(value))

const serializeStatusColors = (value) =>
  JSON.stringify(normalizeStatusColors(value))

const serializeSyncSettings = (value) =>
  JSON.stringify(normalizeSyncSettings(value))

const serializeCanceledDeleteFlag = (value) => JSON.stringify(Boolean(value))
const serializeTransferredSkipFlag = (value) => JSON.stringify(Boolean(value))

const GoogleCalendarSettings = ({ redirectPath = '/cabinet/integrations' }) => {
  const terms = useWorkItemTerminology()
  const terminologyText = (value) =>
    String(value)
      .replaceAll('мероприятиям', terms.pluralDative)
      .replaceAll('мероприятий', terms.pluralGenitive)
      .replaceAll('мероприятия', terms.genitive)
      .replaceAll('мероприятие', terms.label)
  const [calendarStatus, setCalendarStatus] = useState({
    loading: true,
    allowCalendarSync: false,
    connected: false,
    enabled: false,
    calendarId: '',
    calendarName: '',
  })
  const [calendarItems, setCalendarItems] = useState([])
  const [selectedCalendarId, setSelectedCalendarId] = useState('')
  const [calendarError, setCalendarError] = useState('')
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarReminders, setCalendarReminders] = useState(
    DEFAULT_CALENDAR_REMINDERS
  )
  const [statusColors, setStatusColors] = useState(DEFAULT_STATUS_COLORS)
  const [syncSettings, setSyncSettings] = useState(DEFAULT_SYNC_SETTINGS)
  const [savedReminders, setSavedReminders] = useState(
    DEFAULT_CALENDAR_REMINDERS
  )
  const [savedStatusColors, setSavedStatusColors] = useState(
    DEFAULT_STATUS_COLORS
  )
  const [savedSyncSettings, setSavedSyncSettings] = useState(
    DEFAULT_SYNC_SETTINGS
  )
  const [deleteCanceledFromCalendar, setDeleteCanceledFromCalendar] =
    useState(false)
  const [savedDeleteCanceledFromCalendar, setSavedDeleteCanceledFromCalendar] =
    useState(false)
  const [skipTransferredFromCalendar, setSkipTransferredFromCalendar] =
    useState(false)
  const [
    savedSkipTransferredFromCalendar,
    setSavedSkipTransferredFromCalendar,
  ] = useState(false)
  const [checkedSyncSummary, setCheckedSyncSummary] = useState('')
  const [syncProgress, setSyncProgress] = useState({
    open: false,
    total: 0,
    done: 0,
  })
  const [syncSuggestModal, setSyncSuggestModal] = useState({
    open: false,
    source: '',
  })

  const loadCalendarStatus = async () => {
    setCalendarError('')
    setCalendarStatus((prev) => ({ ...prev, loading: true }))
    try {
      const response = await fetch('/api/google-calendar/status')
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось загрузить статус')
        setCalendarStatus((prev) => ({ ...prev, loading: false }))
        return
      }
      setCalendarStatus({ loading: false, ...result.data })
      const nextReminders = normalizeReminders(result?.data?.reminders)
      const nextStatusColors = normalizeStatusColors(result?.data?.statusColors)
      const nextSyncSettings = normalizeSyncSettings(result?.data?.syncSettings)
      const nextDeleteCanceledFromCalendar = Boolean(
        result?.data?.deleteCanceledFromCalendar
      )
      const nextSkipTransferredFromCalendar = Boolean(
        result?.data?.skipTransferredFromCalendar
      )
      setCalendarReminders(nextReminders)
      setStatusColors(nextStatusColors)
      setSyncSettings(nextSyncSettings)
      setSavedReminders(nextReminders)
      setSavedStatusColors(nextStatusColors)
      setSavedSyncSettings(nextSyncSettings)
      setDeleteCanceledFromCalendar(nextDeleteCanceledFromCalendar)
      setSavedDeleteCanceledFromCalendar(nextDeleteCanceledFromCalendar)
      setSkipTransferredFromCalendar(nextSkipTransferredFromCalendar)
      setSavedSkipTransferredFromCalendar(nextSkipTransferredFromCalendar)
    } catch (error) {
      setCalendarError('Не удалось загрузить статус')
      setCalendarStatus((prev) => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gc_connected') === '1') {
      reachGoalOnce('calendar_connected')
      params.delete('gc_connected')
      const query = params.toString()
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    const timer = window.setTimeout(() => {
      loadCalendarStatus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleConnectCalendar = async () => {
    if (calendarLoading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch(
        `/api/google-calendar/auth-url?redirect=${encodeURIComponent(redirectPath)}`
      )
      const result = await response.json()
      if (!result?.success || !result?.data?.url) {
        setCalendarError(result?.error || 'Не удалось получить ссылку')
        setCalendarLoading(false)
        return
      }
      window.location.href = result.data.url
    } catch (error) {
      setCalendarError('Не удалось подключить календарь')
      setCalendarLoading(false)
    }
  }

  const handleLoadCalendars = async () => {
    if (calendarLoading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/calendars')
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось загрузить календари')
        setCalendarLoading(false)
        return
      }
      const calendars = Array.isArray(result?.data?.calendars)
        ? result.data.calendars
        : []
      const selectedId = result?.data?.selectedId || ''
      setCalendarItems(calendars)
      setSelectedCalendarId(selectedId)
    } catch (error) {
      setCalendarError('Не удалось загрузить календари')
    }
    setCalendarLoading(false)
  }

  const handleSelectCalendar = async () => {
    if (!selectedCalendarId || calendarLoading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calendarId: selectedCalendarId }),
      })
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось сохранить календарь')
        setCalendarLoading(false)
        return
      }
      await loadCalendarStatus()
    } catch (error) {
      setCalendarError('Не удалось сохранить календарь')
    }
    setCalendarLoading(false)
  }

  const handleDisconnectCalendar = async () => {
    if (calendarLoading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
      })
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось отключить календарь')
        setCalendarLoading(false)
        return
      }
      setCalendarItems([])
      setSelectedCalendarId('')
      setCalendarReminders(DEFAULT_CALENDAR_REMINDERS)
      setStatusColors(DEFAULT_STATUS_COLORS)
      setSyncSettings(DEFAULT_SYNC_SETTINGS)
      setSavedReminders(DEFAULT_CALENDAR_REMINDERS)
      setSavedStatusColors(DEFAULT_STATUS_COLORS)
      setSavedSyncSettings(DEFAULT_SYNC_SETTINGS)
      setDeleteCanceledFromCalendar(false)
      setSavedDeleteCanceledFromCalendar(false)
      setSkipTransferredFromCalendar(false)
      setSavedSkipTransferredFromCalendar(false)
      await loadCalendarStatus()
    } catch (error) {
      setCalendarError('Не удалось отключить календарь')
    }
    setCalendarLoading(false)
  }

  const handleSaveReminders = async () => {
    if (calendarLoading || calendarStatus.loading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reminders: calendarReminders }),
      })
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось сохранить уведомления')
        setCalendarLoading(false)
        return
      }
      setSavedReminders(normalizeReminders(calendarReminders))
      await loadCalendarStatus()
      setSyncSuggestModal({ open: true, source: 'reminders' })
    } catch (error) {
      setCalendarError('Не удалось сохранить уведомления')
    }
    setCalendarLoading(false)
  }

  const handleSaveStatusColors = async () => {
    if (calendarLoading || calendarStatus.loading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          statusColors,
          reminders: calendarReminders,
          deleteCanceledFromCalendar,
          skipTransferredFromCalendar,
        }),
      })
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось сохранить цвета')
        setCalendarLoading(false)
        return
      }
      setSavedStatusColors(normalizeStatusColors(statusColors))
      setSavedDeleteCanceledFromCalendar(Boolean(deleteCanceledFromCalendar))
      setSavedSkipTransferredFromCalendar(
        Boolean(skipTransferredFromCalendar)
      )
      await loadCalendarStatus()
      setSyncSuggestModal({ open: true, source: 'colors' })
    } catch (error) {
      setCalendarError('Не удалось сохранить цвета')
    }
    setCalendarLoading(false)
  }

  const handleSaveSyncSettings = async () => {
    if (calendarLoading || calendarStatus.loading) return
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const response = await fetch('/api/google-calendar/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          syncSettings,
          reminders: calendarReminders,
          statusColors,
          deleteCanceledFromCalendar,
          skipTransferredFromCalendar,
        }),
      })
      const result = await response.json()
      if (!result?.success) {
        setCalendarError(result?.error || 'Не удалось сохранить настройки')
        setCalendarLoading(false)
        return
      }
      setSavedSyncSettings(normalizeSyncSettings(syncSettings))
      await loadCalendarStatus()
      setSyncSuggestModal({ open: true, source: 'syncSettings' })
    } catch (error) {
      setCalendarError('Не удалось сохранить настройки')
    }
    setCalendarLoading(false)
  }

  const remindersChanged =
    serializeReminders(calendarReminders) !== serializeReminders(savedReminders)
  const statusColorsChanged =
    serializeStatusColors(statusColors) !==
      serializeStatusColors(savedStatusColors) ||
    serializeCanceledDeleteFlag(deleteCanceledFromCalendar) !==
      serializeCanceledDeleteFlag(savedDeleteCanceledFromCalendar) ||
    serializeTransferredSkipFlag(skipTransferredFromCalendar) !==
      serializeTransferredSkipFlag(savedSkipTransferredFromCalendar)
  const syncSettingsChanged =
    serializeSyncSettings(syncSettings) !==
    serializeSyncSettings(savedSyncSettings)
  const calendarSettingsChangedBeforeSync =
    shouldSaveGoogleCalendarSettingsBeforeSync({
      remindersChanged,
      statusColorsChanged,
      syncSettingsChanged,
    })

  const handleSyncCheckedEvents = async () => {
    if (calendarLoading || calendarStatus.loading) return
    setCalendarLoading(true)
    setCalendarError('')
    setCheckedSyncSummary('')
    setSyncProgress({ open: false, total: 0, done: 0 })
    try {
      if (calendarSettingsChangedBeforeSync) {
        const saveResponse = await fetch('/api/google-calendar/reminders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reminders: calendarReminders,
            statusColors,
            syncSettings,
            deleteCanceledFromCalendar,
            skipTransferredFromCalendar,
          }),
        })
        const saveResult = await saveResponse.json()
        if (!saveResult?.success) {
          setCalendarError(
            saveResult?.error ||
              'Не удалось сохранить настройки перед синхронизацией'
          )
          setCalendarLoading(false)
          return
        }
        setSavedReminders(normalizeReminders(calendarReminders))
        setSavedStatusColors(normalizeStatusColors(statusColors))
        setSavedSyncSettings(normalizeSyncSettings(syncSettings))
        setSavedDeleteCanceledFromCalendar(Boolean(deleteCanceledFromCalendar))
        setSavedSkipTransferredFromCalendar(
          Boolean(skipTransferredFromCalendar)
        )
      }

      const listResponse = await fetch('/api/events/google-sync-checked')
      const listResult = await listResponse.json()
      if (!listResult?.success) {
        setCalendarError(
          listResult?.error ||
            `Не удалось получить список проверенных ${terms.pluralGenitive}`
        )
        setCalendarLoading(false)
        return
      }

      const queue = Array.isArray(listResult?.data?.events)
        ? listResult.data.events
        : []
      const total = queue.length
      setSyncProgress({ open: true, total, done: 0 })

      if (total === 0) {
        setCheckedSyncSummary(`Нет ${terms.pluralGenitive} для синхронизации.`)
        setSyncProgress({ open: false, total: 0, done: 0 })
        setCalendarLoading(false)
        return
      }

      let synced = 0
      let failed = 0
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index]
        const syncResponse = await fetch('/api/events/google-sync-checked', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: item?._id }),
        })
        const syncResult = await syncResponse.json()
        if (syncResult?.success) synced += 1
        else failed += 1
        setSyncProgress({ open: true, total, done: index + 1 })
      }

      setCheckedSyncSummary(
        `Синхронизировано: ${synced} из ${total}. Ошибок: ${failed}.`
      )
      setSyncProgress({ open: false, total: 0, done: 0 })
    } catch (error) {
      setCalendarError(`Не удалось синхронизировать проверенные ${terms.pluralAccusative}`)
      setSyncProgress({ open: false, total: 0, done: 0 })
    }
    setCalendarLoading(false)
  }

  if (calendarStatus.loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-600">
        <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
        <span>Загружаем настройки Google Calendar...</span>
      </div>
    )
  }

  if (!calendarStatus.allowCalendarSync) return null

  return (
    <>
      <div className="bg-white">
        <div className="mt-2 text-sm text-gray-600">
          {calendarStatus.connected ? 'Подключен' : 'Не подключен'}
        </div>
        {calendarStatus.connected && calendarStatus.calendarId ? (
          <div className="mt-1 text-xs text-gray-500">
            Календарь:{' '}
            {calendarStatus.calendarName ||
              calendarItems.find(
                (item) => item.id === calendarStatus.calendarId
              )?.summary ||
              calendarStatus.calendarId}
          </div>
        ) : null}
        {calendarError ? (
          <div className="mt-2 text-xs text-red-600">{calendarError}</div>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-3">
          {!calendarStatus.connected ? (
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={handleConnectCalendar}
              disabled={calendarLoading || calendarStatus.loading}
            >
              {calendarLoading
                ? 'Подключение...'
                : 'Подключить Google Calendar'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
                onClick={handleLoadCalendars}
                disabled={calendarLoading}
              >
                Выбрать календарь
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-danger disabled:cursor-not-allowed disabled:bg-gray-300"
                onClick={handleDisconnectCalendar}
                disabled={calendarLoading}
              >
                Отключить
              </button>
            </>
          )}
        </div>
        {calendarStatus.connected ? (
          <div className="p-3 mt-3 bg-white border border-gray-200 rounded">
            <div className="text-sm font-semibold text-gray-800">
              Массовая синхронизация
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Отправляет/обновляет в Google Calendar все {terms.pluralAccusative}.
            </div>
            <div className="flex justify-end mt-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
                onClick={handleSyncCheckedEvents}
                disabled={calendarLoading || calendarStatus.loading}
              >
                Синхронизировать Google Calendar
              </button>
            </div>
            {checkedSyncSummary ? (
              <div className="mt-2 text-xs text-emerald-700">
                {checkedSyncSummary}
              </div>
            ) : null}
          </div>
        ) : null}
        {calendarItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <NativeSelect
              className="px-2 text-sm border border-gray-300 rounded h-9"
              value={selectedCalendarId}
              onChange={(event) => setSelectedCalendarId(event.target.value)}
            >
              {calendarItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.primary ? 'Основной' : item.summary || item.id}
                </option>
              ))}
            </NativeSelect>
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={handleSelectCalendar}
              disabled={!selectedCalendarId || calendarLoading}
            >
              Сохранить
            </button>
          </div>
        ) : null}
        <div className="p-3 mt-4 bg-white border border-gray-200 rounded">
          <div className="text-sm font-semibold text-gray-800">
            Что отправлять в Google Calendar
          </div>
          <IconCheckBox
            checked={Boolean(syncSettings.showStatusIcons)}
            onClick={() =>
              setSyncSettings((prev) => ({
                ...prev,
                showStatusIcons: !prev.showStatusIcons,
              }))
            }
            label="Добавить в начале заголовка иконки статуса оплаты и передачи коллеге"
            small
            noMargin
            disabled={!calendarStatus.connected}
            wrapperClassName="mt-2"
          />
          <label className="flex flex-col gap-1 mt-2">
            <span className="text-sm text-gray-700">Заголовок события</span>
            <NativeSelect
              wrapperClassName="w-full"
              className="w-full px-2 text-sm border border-gray-300 rounded h-9"
              value={syncSettings.titleMode}
              onChange={(event) =>
                setSyncSettings((prev) => ({
                  ...prev,
                  titleMode: event.target.value,
                }))
              }
              disabled={!calendarStatus.connected}
            >
              {TITLE_MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {terminologyText(item.name)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="grid grid-cols-1 gap-2 mt-3 tablet:grid-cols-2">
            {SYNC_FIELD_OPTIONS.map((item) => (
              <IconCheckBox
                key={item.key}
                checked={Boolean(syncSettings[item.key])}
                onClick={() =>
                  setSyncSettings((prev) => ({
                    ...prev,
                    [item.key]: !prev[item.key],
                  }))
                }
                label={terminologyText(item.label)}
                small
                noMargin
                disabled={!calendarStatus.connected}
              />
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={handleSaveSyncSettings}
              disabled={
                calendarLoading ||
                calendarStatus.loading ||
                !calendarStatus.connected ||
                !syncSettingsChanged
              }
            >
              Сохранить состав синхронизации
            </button>
          </div>
        </div>
        <div className="p-3 mt-4 bg-white border border-gray-200 rounded">
          <div className="text-sm font-semibold text-gray-800">
            Уведомления Google Calendar
          </div>
          <div className="mt-2">
            <IconCheckBox
              checked={calendarReminders.useDefault}
              onClick={() =>
                setCalendarReminders((prev) => ({
                  ...prev,
                  useDefault: !prev.useDefault,
                }))
              }
              label="Использовать стандартные уведомления Google"
              small
              noMargin
              disabled={!calendarStatus.connected}
            />
          </div>
          {!calendarReminders.useDefault && (
            <div className="flex flex-col gap-2 mt-2">
              {calendarReminders.overrides.map((item, index) => (
                <div
                  key={`calendar-reminder-${index}`}
                  className="flex items-center gap-2"
                >
                  <NativeSelect
                    className="px-2 text-sm border border-gray-300 rounded h-9"
                    value={item.method}
                    onChange={(event) => {
                      const method = event.target.value
                      setCalendarReminders((prev) => ({
                        ...prev,
                        overrides: prev.overrides.map((row, idx) =>
                          idx === index ? { ...row, method } : row
                        ),
                      }))
                    }}
                    disabled={!calendarStatus.connected}
                  >
                    <option value="popup">Уведомление</option>
                    <option value="email">Email</option>
                  </NativeSelect>
                  <input
                    type="number"
                    min={1}
                    className="px-2 text-sm border border-gray-300 rounded hide-number-spin h-9 w-14"
                    value={item.minutes}
                    onChange={(event) => {
                      const minutes = toNormalizedNumber(event.target.value, {
                        fallback: 0,
                      })
                      setCalendarReminders((prev) => ({
                        ...prev,
                        overrides: prev.overrides.map((row, idx) =>
                          idx === index
                            ? {
                                ...row,
                                minutes,
                              }
                            : row
                        ),
                      }))
                    }}
                    disabled={!calendarStatus.connected}
                  />
                  <span className="text-xs leading-3 text-center text-gray-500">
                    минут до
                  </span>
                  <IconActionButton
                    icon={faTrashAlt}
                    onClick={() =>
                      setCalendarReminders((prev) => ({
                        ...prev,
                        overrides: prev.overrides.filter(
                          (_, idx) => idx !== index
                        ),
                      }))
                    }
                    disabled={!calendarStatus.connected}
                    title="Удалить уведомление"
                    variant="danger"
                    size="xs"
                  />
                </div>
              ))}
              <AddIconButton
                onClick={() =>
                  setCalendarReminders((prev) => ({
                    ...prev,
                    overrides: [
                      ...prev.overrides,
                      { method: 'popup', minutes: 60 },
                    ],
                  }))
                }
                disabled={!calendarStatus.connected}
                title="Добавить уведомление"
                size="xs"
              />
            </div>
          )}
          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={handleSaveReminders}
              disabled={
                calendarLoading ||
                calendarStatus.loading ||
                !calendarStatus.connected ||
                !remindersChanged ||
                (!calendarReminders.useDefault &&
                  calendarReminders.overrides.length === 0)
              }
            >
              Сохранить уведомления
            </button>
          </div>
        </div>
        <div className="p-3 mt-4 bg-white border border-gray-200 rounded">
          <div className="text-sm font-semibold text-gray-800">
            Цвета по статусам и условия синхронизации
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Цвет применяется к событию в Google Calendar при синхронизации.
          </div>
          <div className="mt-3">
            <IconCheckBox
              checked={deleteCanceledFromCalendar}
              onClick={() => setDeleteCanceledFromCalendar((prev) => !prev)}
              label="Не синхронизировать с календарем, если отменено"
              small
              noMargin
              disabled={!calendarStatus.connected}
            />
            <IconCheckBox
              checked={skipTransferredFromCalendar}
              onClick={() => setSkipTransferredFromCalendar((prev) => !prev)}
              label="Не синхронизировать с календарем, если передано"
              small
              noMargin
              disabled={!calendarStatus.connected}
              wrapperClassName="mt-2"
            />
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {STATUS_COLOR_FIELDS.filter(
              (field) =>
                !(deleteCanceledFromCalendar && field.key === 'canceled')
            ).map((field) => (
              <label
                key={field.key}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-gray-700">{field.label}</span>
                <NativeSelect
                  className="h-9 min-w-[180px] rounded border border-gray-300 px-2 text-sm"
                  value={statusColors[field.key]}
                  onChange={(event) =>
                    setStatusColors((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))
                  }
                  style={(() => {
                    const selectedColor = STATUS_COLOR_OPTIONS.find(
                      (item) => item.value === statusColors[field.key]
                    )
                    return selectedColor
                      ? {
                          backgroundColor: selectedColor.bg,
                          color: selectedColor.text,
                          fontWeight: 600,
                        }
                      : undefined
                  })()}
                  disabled={!calendarStatus.connected}
                >
                  {STATUS_COLOR_OPTIONS.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                      style={{
                        backgroundColor: item.bg,
                        color: item.text,
                        fontWeight: 600,
                      }}
                    >
                      {item.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white modal-action-button bg-general disabled:cursor-not-allowed disabled:bg-gray-300"
              onClick={handleSaveStatusColors}
              disabled={
                calendarLoading ||
                calendarStatus.loading ||
                !calendarStatus.connected ||
                !statusColorsChanged
              }
            >
              Сохранить цвета и условия
            </button>
          </div>
        </div>
      </div>
      {syncProgress.open ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow-xl">
            <div className="text-sm font-semibold text-gray-900">
              Синхронизация Google Calendar
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Выполнено: {syncProgress.done} / {syncProgress.total}
            </div>
            <div className="w-full h-2 mt-3 overflow-hidden bg-gray-200 rounded-full">
              <div
                className="h-2 transition-all duration-300 rounded-full bg-general"
                style={{
                  width: `${
                    syncProgress.total > 0
                      ? Math.round(
                          (syncProgress.done / syncProgress.total) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      {syncSuggestModal.open ? (
        <div className="fixed inset-0 z-[1210] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow-xl">
            <div className="text-sm font-semibold text-gray-900">
              Настройки сохранены
            </div>
            <div className="mt-2 text-sm text-gray-700">
              {syncSuggestModal.source === 'reminders'
                ? `Синхронизировать ${terms.pluralAccusative}, чтобы обновить уведомления в Google Calendar?`
                : syncSuggestModal.source === 'syncSettings'
                  ? `Синхронизировать ${terms.pluralAccusative}, чтобы обновить данные в Google Calendar?`
                  : `Синхронизировать ${terms.pluralAccusative}, чтобы обновить цвета и условия синхронизации в Google Calendar?`}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded hover:bg-gray-50"
                onClick={() => setSyncSuggestModal({ open: false, source: '' })}
              >
                Позже
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-semibold text-white rounded bg-general hover:opacity-90"
                onClick={async () => {
                  setSyncSuggestModal({ open: false, source: '' })
                  await handleSyncCheckedEvents()
                }}
              >
                Синхронизировать
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default GoogleCalendarSettings
