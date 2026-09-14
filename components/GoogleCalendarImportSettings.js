'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Button from '@components/Button'
import LoadingSpinner from '@components/LoadingSpinner'
import NativeSelect from '@components/NativeSelect'
import Notice from '@components/Notice'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const BATCH_SIZE = 10

const formatInputDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultRange = () => {
  const from = new Date()
  const to = new Date(from)
  to.setMonth(to.getMonth() + 6)
  return { from: formatInputDate(from), to: formatInputDate(to) }
}

const toRangeIso = (value, endOfDay = false) => {
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'
  return new Date(`${value}${suffix}`).toISOString()
}

const formatDateTime = (value, allDay) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(date)
}

const formatRub = (value) =>
  new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const GoogleCalendarImportSettings = () => {
  const terms = useWorkItemTerminology()
  const queryClient = useQueryClient()
  const initialRange = useMemo(getDefaultRange, [])
  const [calendarStatus, setCalendarStatus] = useState({ loading: true })
  const [calendars, setCalendars] = useState([])
  const [selectedCalendarId, setSelectedCalendarId] = useState('')
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [preview, setPreview] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const loadCalendarState = useCallback(async () => {
    setCalendarStatus((current) => ({ ...current, loading: true }))
    try {
      const response = await fetch('/api/google-calendar/import-status')
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось проверить календарь')
      }
      setCalendarStatus({ ...payload.data, loading: false })
      setSelectedCalendarId(payload.data.calendarId || '')
      if (payload.data.connected) {
        const calendarsResponse = await fetch(
          '/api/google-calendar/import-calendars'
        )
        const calendarsPayload = await calendarsResponse.json().catch(() => null)
        if (!calendarsResponse.ok || !calendarsPayload?.success) {
          throw new Error(
            calendarsPayload?.error || 'Не удалось получить календари импорта'
          )
        }
        setCalendars(calendarsPayload.data.calendars ?? [])
        setSelectedCalendarId(payload.data.calendarId || '')
      }
    } catch (loadError) {
      setCalendarStatus({ loading: false, connected: false })
      setError(loadError?.message || 'Не удалось проверить календарь')
    }
  }, [])

  const disconnectCalendar = useCallback(async () => {
    if (
      !window.confirm(
        'Отключить Google-аккаунт от импорта? Настройки синхронизации не изменятся.'
      )
    ) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/google-calendar/import-disconnect', {
        method: 'POST',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось отключить аккаунт')
      }
      setCalendars([])
      setSelectedCalendarId('')
      setPreview(null)
      setSelectedIds(new Set())
      setResult(null)
      await loadCalendarState()
    } catch (disconnectError) {
      setError(disconnectError?.message || 'Не удалось отключить аккаунт')
    } finally {
      setLoading(false)
    }
  }, [loadCalendarState])

  useEffect(() => {
    loadCalendarState()
  }, [loadCalendarState])

  const connectCalendar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const redirect = '/cabinet/import'
      const response = await fetch(
        `/api/google-calendar/auth-url?redirect=${encodeURIComponent(redirect)}&purpose=import`
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.data?.url) {
        throw new Error(payload?.error || 'Не удалось подключить календарь')
      }
      window.location.assign(payload.data.url)
    } catch (connectError) {
      setError(connectError?.message || 'Не удалось подключить календарь')
      setLoading(false)
    }
  }, [])

  const selectCalendar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/google-calendar/import-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: selectedCalendarId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось выбрать календарь')
      }
      setPreview(null)
      await loadCalendarState()
    } catch (selectError) {
      setError(selectError?.message || 'Не удалось выбрать календарь')
    } finally {
      setLoading(false)
    }
  }, [loadCalendarState, selectedCalendarId])

  const scanEvents = useCallback(async ({ preserveResult = false } = {}) => {
    setLoading(true)
    setError('')
    if (!preserveResult) setResult(null)
    try {
      const timeMin = toRangeIso(dateFrom)
      const timeMax = toRangeIso(dateTo, true)
      const params = new URLSearchParams({ timeMin, timeMax })
      const response = await fetch(`/api/events/google-import?${params}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось получить события')
      }
      setPreview({ ...payload.data, timeMin, timeMax })
      setSelectedIds(
        new Set(
          (payload.data.candidates ?? [])
            .filter((item) => !item.alreadyImported && !item.canceled)
            .slice(0, payload.data.maxEvents ?? 100)
            .map((item) => item.id)
        )
      )
    } catch (scanError) {
      setPreview(null)
      setSelectedIds(new Set())
      setError(scanError?.message || 'Не удалось получить события')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  const selectedCandidates = useMemo(() => {
    const items = preview?.candidates ?? []
    return items.filter((item) => selectedIds.has(item.id))
  }, [preview?.candidates, selectedIds])

  const aiCount = selectedCandidates.filter((item) => item.needsAi).length
  const estimatedCost =
    preview?.quote?.billingMode === 'artistcrm'
      ? aiCount * Number(preview?.quote?.costPerEvent || 0)
      : 0
  const insufficientBalance = Boolean(
    preview?.quote?.billingMode === 'artistcrm' &&
      Number(preview?.quote?.balance || 0) <= estimatedCost
  )
  const platformUnavailable = Boolean(
    preview?.quote?.billingMode === 'artistcrm' &&
      !preview?.quote?.platformConfigured
  )
  const importCalendarReady = Boolean(
    calendarStatus.connected &&
      calendarStatus.calendarId &&
      selectedCalendarId === calendarStatus.calendarId
  )

  const toggleCandidate = useCallback(
    (id) => {
      setSelectedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else if (next.size < Number(preview?.maxEvents || 100)) next.add(id)
        return next
      })
    },
    [preview?.maxEvents]
  )

  const importEvents = useCallback(async () => {
    if (!preview || selectedIds.size === 0) return
    setImporting(true)
    setError('')
    setResult(null)
    const ids = Array.from(selectedIds)
    const groupId =
      globalThis.crypto?.randomUUID?.() || `calendar-import-${Date.now()}`
    const collected = []
    let actualCost = 0
    setProgress({ done: 0, total: ids.length })

    try {
      for (let index = 0; index < ids.length; index += BATCH_SIZE) {
        const batch = ids.slice(index, index + BATCH_SIZE)
        const response = await fetch('/api/events/google-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeMin: preview.timeMin,
            timeMax: preview.timeMax,
            eventIds: batch,
            groupId,
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Не удалось импортировать события')
        }
        collected.push(...(payload.data.results ?? []))
        actualCost = Number(payload.data.actualCost || actualCost)
        setProgress({ done: Math.min(index + batch.length, ids.length), total: ids.length })
      }
      const created = collected.filter((item) => item.status === 'created').length
      const requiresReview = collected.filter(
        (item) => item.status === 'created' && item.warnings?.length > 0
      ).length
      setResult({
        created,
        skipped: collected.length - created,
        requiresReview,
        actualCost,
        items: collected,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['clients'] }),
      ])
      await scanEvents({ preserveResult: true })
    } catch (importError) {
      setError(
        `${importError?.message || 'Не удалось выполнить импорт'}. Уже созданные ${terms.plural} сохранены; повторный запуск не создаст дубли.`
      )
    } finally {
      setImporting(false)
    }
  }, [preview, queryClient, scanEvents, selectedIds, terms.plural])

  if (calendarStatus.loading) {
    return <LoadingSpinner text="Проверяем Google Calendar..." />
  }

  if (!calendarStatus.allowCalendarSync || !calendarStatus.allowAi) {
    return (
      <Notice tone="warning" className="calendar-import-warning p-4">
        Импорт доступен в тарифе, где включены Google Calendar и ИИ-возможности.
      </Notice>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <section className="surface-card rounded-xl border p-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Импорт из Google Calendar
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Сначала получите список событий и стоимость. Ничего не будет создано
          без вашего подтверждения.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Для импорта подключается отдельный Google-аккаунт. Он может отличаться
          от аккаунта синхронизации в разделе «Интеграции».
        </p>

        {!calendarStatus.connected ? (
          <div className="mt-4 flex flex-col items-start gap-2">
            <div className="text-sm text-gray-700">
              Google-аккаунт для импорта не подключён.
            </div>
            <Button
              name="Подключить аккаунт для импорта"
              onClick={connectCalendar}
              loading={loading}
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-700">
                Календарь для импорта
                <NativeSelect
                  value={selectedCalendarId}
                  onChange={(event) => {
                    setSelectedCalendarId(event.target.value)
                    setPreview(null)
                  }}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900"
                >
                  <option value="">Выберите календарь</option>
                  {calendars.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.primary ? 'Основной — ' : ''}
                      {item.summary || item.id}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button
                name={importCalendarReady ? 'Выбран' : 'Выбрать для импорта'}
                onClick={selectCalendar}
                disabled={!selectedCalendarId || importCalendarReady}
                loading={loading}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="action-icon-button h-9 cursor-pointer rounded px-3 text-sm"
                onClick={connectCalendar}
                disabled={loading}
              >
                Подключить другой аккаунт
              </button>
              <button
                type="button"
                className="action-icon-button action-icon-button--warning h-9 cursor-pointer rounded px-3 text-sm"
                onClick={disconnectCalendar}
                disabled={loading}
              >
                Отключить импорт
              </button>
            </div>
          </div>
        )}
      </section>

      {importCalendarReady ? (
        <section className="surface-card rounded-xl border p-4">
          <h3 className="font-semibold text-gray-900">Период импорта</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              С даты
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              По дату
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-gray-900"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="action-icon-button h-9 cursor-pointer rounded px-3 text-sm"
              onClick={() => {
                const from = new Date()
                const to = new Date(from)
                to.setMonth(to.getMonth() + 3)
                setDateFrom(formatInputDate(from))
                setDateTo(formatInputDate(to))
              }}
            >
              Ближайшие 3 месяца
            </button>
            <button
              type="button"
              className="action-icon-button h-9 cursor-pointer rounded px-3 text-sm"
              onClick={() => {
                const range = getDefaultRange()
                setDateFrom(range.from)
                setDateTo(range.to)
              }}
            >
              Ближайшие 6 месяцев
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              name={`Найти ${terms.pluralAccusative}`}
              onClick={scanEvents}
              loading={loading}
              disabled={!dateFrom || !dateTo || importing}
            />
          </div>
        </section>
      ) : null}

      {error ? (
        <Notice
          tone="error"
          role="alert"
          className="calendar-import-error p-3"
        >
          {error}
        </Notice>
      ) : null}

      {preview ? (
        <section className="surface-card rounded-xl border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                Найдено: {preview.candidates?.length ?? 0}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Выбрано {selectedIds.size}. Уже импортированные и отменённые
                события не выбираются автоматически.
              </p>
            </div>
            <div className="calendar-import-quote rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              {preview.quote?.billingMode === 'artistcrm' ? (
                <>
                  <div>
                    ИИ обработает: <b>{aiCount}</b>
                  </div>
                  <div>
                    Ориентировочно: <b>{formatRub(estimatedCost)} ₽</b>
                  </div>
                  <div className="text-xs text-violet-700">
                    Баланс: {formatRub(preview.quote.balance)} ₽
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium">Собственный ИИ-провайдер</div>
                  <div className="text-xs text-violet-700">
                    Списаний с баланса Ведело не будет.
                  </div>
                </>
              )}
            </div>
          </div>

          {insufficientBalance ? (
            <Notice
              tone="warning"
              className="calendar-import-warning mt-3 p-3"
            >
              Баланса может не хватить на выбранные описания. Уменьшите выбор
              или пополните баланс.
            </Notice>
          ) : null}
          {platformUnavailable ? (
            <Notice
              tone="error"
              role="alert"
              className="calendar-import-error mt-3 p-3"
            >
              Общий ИИ Ведело временно не настроен. Подключите собственный
              AITunnel или повторите попытку позже.
            </Notice>
          ) : null}

          <div className="mt-4 max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {(preview.candidates ?? []).map((item) => {
              const disabled = item.alreadyImported || item.canceled
              return (
                <label
                  key={item.id}
                  className={`flex gap-3 rounded-lg border p-3 ${
                    disabled
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-70'
                      : 'cursor-pointer border-gray-200 bg-white hover:border-violet-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    disabled={disabled || importing}
                    onChange={() => toggleCandidate(item.id)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-violet-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {item.title}
                      </span>
                      {item.alreadyImported ? (
                        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                          Уже импортировано
                        </span>
                      ) : null}
                      {item.canceled ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          Отменено
                        </span>
                      ) : null}
                      {item.allDay ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          Весь день → 12:00
                        </span>
                      ) : null}
                      {item.needsAi ? (
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                          Анализ ИИ
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatDateTime(item.eventDate, item.allDay)}
                      {item.location ? ` • ${item.location}` : ''}
                    </div>
                    {item.descriptionPreview ? (
                      <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                        {item.descriptionPreview}
                      </div>
                    ) : null}
                  </div>
                </label>
              )
            })}
          </div>

          {importing ? (
            <Notice
              tone="info"
              role="status"
              className="calendar-import-progress mt-4 p-3"
            >
              Импортировано и обработано: {progress.done} из {progress.total}
            </Notice>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              Импорт создаёт заявки для проверки и не создаёт транзакции.
            </div>
            <Button
              name={`Импортировать ${selectedIds.size || ''}`.trim()}
              onClick={importEvents}
              loading={importing}
              disabled={
                selectedIds.size === 0 ||
                selectedIds.size > Number(preview.maxEvents || 100) ||
                insufficientBalance ||
                platformUnavailable
              }
            />
          </div>
        </section>
      ) : null}

      {result ? (
        <Notice
          as="section"
          tone="success"
          role="status"
          className="calendar-import-result rounded-xl p-4"
        >
          <h3 className="font-semibold">Импорт завершён</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>Создано: {result.created}</div>
            <div>Пропущено: {result.skipped}</div>
            <div>С предупреждениями: {result.requiresReview}</div>
            <div>Списано: {formatRub(result.actualCost)} ₽</div>
          </div>
        </Notice>
      ) : null}
    </div>
  )
}

export default GoogleCalendarImportSettings
