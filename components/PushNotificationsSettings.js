'use client'

import { useAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import {
  PUSH_LOG_PREVIEW_LIMIT,
  getPushDeliveryPresentation,
  getPushLogBody,
  getPushLogTitle,
} from '@helpers/pushDeliveryPresentation.mjs'
import {
  formatPushDevicesCount,
  getPushDevicePresentation,
} from '@helpers/pushDeviceStatus.mjs'
import {
  getPushRegistration,
  getPushRegistrationWithDetails,
  isPushSupported,
  // showLocalTestNotification,
  syncPushSubscription,
} from '@helpers/pushClient'

const DEFAULT_ADDITIONAL_EVENTS_PUSH_TIME = '10:00'
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const hours = String(Math.floor(i / 4)).padStart(2, '0')
  const minutes = String((i % 4) * 15).padStart(2, '0')
  return `${hours}:${minutes}`
})

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeReminderTime = (value) => {
  const raw = String(value || '').trim()
  return REMINDER_TIME_PATTERN.test(raw)
    ? raw
    : DEFAULT_ADDITIONAL_EVENTS_PUSH_TIME
}

const fetchPushStatus = async (subscription) => {
  const response = await fetch('/api/push/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription?.toJSON?.() || null }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Не удалось проверить push-подписки')
  }
  return {
    activeSubscriptions: Number(payload?.data?.activeSubscriptions || 0),
    activeWebSubscriptions: Number(payload?.data?.activeWebSubscriptions || 0),
    activeMobileSubscriptions: Number(
      payload?.data?.activeMobileSubscriptions || 0
    ),
    currentDeviceActive: payload?.data?.currentDeviceActive === true,
  }
}

const PushNotificationsSettings = () => {
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const snackbar = useSnackbar()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushAction, setPushAction] = useState('')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushAvailable, setPushAvailable] = useState(null)
  const [activePushSubscriptions, setActivePushSubscriptions] = useState(null)
  const [activeWebPushSubscriptions, setActiveWebPushSubscriptions] =
    useState(null)
  const [activeMobilePushSubscriptions, setActiveMobilePushSubscriptions] =
    useState(null)
  const [pushLogs, setPushLogs] = useState([])
  const [pushLogsLoading, setPushLogsLoading] = useState(false)
  const [showAllPushLogs, setShowAllPushLogs] = useState(false)
  const [pushDiagnosticMessage, setPushDiagnosticMessage] = useState('')
  const customSettings = siteSettings?.custom ?? {}
  const isPushEnabled =
    getCustomValue(customSettings, 'publicLeadPushEnabled') === true
  const additionalEventsPushTime = normalizeReminderTime(
    getCustomValue(customSettings, 'additionalEventsPushTime')
  )
  const visiblePushLogs = showAllPushLogs
    ? pushLogs
    : pushLogs.slice(0, PUSH_LOG_PREVIEW_LIMIT)
  const hasMorePushLogs = pushLogs.length > PUSH_LOG_PREVIEW_LIMIT
  const devicePresentation = getPushDevicePresentation({
    available: pushAvailable,
    permission: pushPermission,
    subscribed: pushSubscribed,
  })

  const refreshPushLogs = useCallback(async () => {
    setPushLogsLoading(true)
    try {
      const response = await fetch('/api/push/logs?limit=20')
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload?.success && Array.isArray(payload?.data)) {
        setPushLogs(payload.data)
      }
    } finally {
      setPushLogsLoading(false)
    }
  }, [])

  const saveCustom = useCallback(
    async (patch) => {
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            ...patch,
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        null
      )
    },
    [setSiteSettings, siteSettings?.custom]
  )

  const refreshPushState = useCallback(async () => {
    const available = isPushSupported()
    setPushAvailable(available)
    setPushPermission(available ? Notification.permission : 'unsupported')
    let subscription = null
    if (!available) {
      setPushSubscribed(false)
      setPushDiagnosticMessage('')
    } else {
      const registrationResult = await getPushRegistrationWithDetails()
      const registration = registrationResult?.registration || null
      setPushDiagnosticMessage(
        registrationResult?.ok ? '' : registrationResult?.message || ''
      )
      if (registration?.pushManager) {
        subscription = await registration.pushManager
          .getSubscription()
          .catch(() => null)
      }
    }

    try {
      const status = await fetchPushStatus(subscription)
      setActivePushSubscriptions(status.activeSubscriptions)
      setActiveWebPushSubscriptions(status.activeWebSubscriptions)
      setActiveMobilePushSubscriptions(status.activeMobileSubscriptions)
      setPushSubscribed(Boolean(subscription && status.currentDeviceActive))
    } catch (error) {
      setActivePushSubscriptions(null)
      setActiveWebPushSubscriptions(null)
      setActiveMobilePushSubscriptions(null)
      setPushSubscribed(Boolean(subscription))
      setPushDiagnosticMessage((current) => current || error.message)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshPushState()
      refreshPushLogs()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refreshPushLogs, refreshPushState])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshPushState()
    }
    const handleFocus = () => refreshPushState()

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshPushState])

  const enablePushNotifications = async () => {
    if (!isPushSupported()) {
      snackbar.warning('Push-уведомления не поддерживаются на этом устройстве')
      return
    }

    setPushBusy(true)
    setPushAction('enable')
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        snackbar.warning('Разрешение на уведомления не выдано')
        return
      }

      const registrationResult = await getPushRegistrationWithDetails()
      const registration = registrationResult?.registration || null
      if (!registrationResult?.ok || !registration?.pushManager) {
        snackbar.error(
          registrationResult?.message || 'Service Worker не готов для push'
        )
        return
      }

      await syncPushSubscription({
        registration,
        ensureLocalSubscription: true,
      })

      await saveCustom({ publicLeadPushEnabled: true })
      setPushSubscribed(true)
      refreshPushLogs()
      snackbar.success('Push-уведомления включены')
    } catch (error) {
      snackbar.error(
        error?.message
          ? `Не удалось включить push-уведомления: ${error.message}`
          : 'Не удалось включить push-уведомления'
      )
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const disablePushOnThisDevice = async () => {
    setPushBusy(true)
    setPushAction('disable')
    try {
      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager
        ?.getSubscription()
        .catch(() => null)

      if (subscription) {
        const response = await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Не удалось отключить устройство')
        }
        await subscription.unsubscribe().catch(() => null)
      }

      setPushSubscribed(false)
      refreshPushLogs()
      snackbar.success('Push-уведомления отключены на этом устройстве')
    } catch (error) {
      snackbar.error(error?.message || 'Не удалось отключить это устройство')
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const enablePushForAccount = async () => {
    setPushBusy(true)
    setPushAction('enable-account')
    try {
      await saveCustom({ publicLeadPushEnabled: true })
      snackbar.success('Уведомления аккаунта включены')
    } catch (error) {
      snackbar.error('Не удалось включить уведомления аккаунта')
    } finally {
      setPushBusy(false)
      setPushAction('')
    }
  }

  const disablePushOnAllDevices = async () => {
    const confirmed = window.confirm(
      'Отключить push-уведомления на всех устройствах, включая мобильное приложение?'
    )
    if (!confirmed) return

    setPushBusy(true)
    setPushAction('disable-all')
    try {
      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager
        ?.getSubscription()
        .catch(() => null)
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Не удалось отключить все устройства')
      }

      await subscription?.unsubscribe().catch(() => null)
      await saveCustom({ publicLeadPushEnabled: false })
      setPushSubscribed(false)
      setActivePushSubscriptions(0)
      setActiveWebPushSubscriptions(0)
      setActiveMobilePushSubscriptions(0)
      refreshPushLogs()
      snackbar.success('Push-уведомления отключены на всех устройствах')
    } catch (error) {
      snackbar.error(error?.message || 'Не удалось отключить все устройства')
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const sendTestPush = async () => {
    if (!isPushEnabled || Number(activeWebPushSubscriptions || 0) <= 0) {
      snackbar.warning('Сначала подключите хотя бы одно Web/PWA-устройство')
      return
    }

    setPushBusy(true)
    setPushAction('test')
    try {
      let response = await fetch('/api/push/test', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      const hasDeliveryErrors =
        Number(payload?.data?.failed || 0) > 0 ||
        Number(payload?.data?.deactivated || 0) > 0

      if (hasDeliveryErrors && pushSubscribed) {
        await syncPushSubscription({
          ensureLocalSubscription: true,
          forceNewSubscription: true,
        })
        response = await fetch('/api/push/test', { method: 'POST' })
        const retryPayload = await response.json().catch(() => ({}))
        if (response.ok && retryPayload?.success) {
          snackbar.success(
            `Подписка обновлена, тест отправлен: ${Number(
              retryPayload?.data?.sent || 0
            )}`
          )
          refreshPushLogs()
          return
        }
      }

      if (!response.ok || !payload?.success) {
        snackbar.error(payload?.error || 'Не удалось отправить тест')
        return
      }

      const sent = Number(payload?.data?.sent || 0)
      if (sent <= 0) {
        snackbar.warning('Тест отправлен, но активных подписок не найдено')
        refreshPushLogs()
        return
      }
      snackbar.success(
        `Тест отправлен в push-сервис: ${sent}. Если уведомления нет, проблема уже после отправки.`
      )
      refreshPushLogs()
    } catch (error) {
      snackbar.error('Не удалось отправить тест push')
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  // const sendLocalTestPush = async () => {
  //   setPushBusy(true)
  //   setPushAction('local-test')
  //   try {
  //     const result = await showLocalTestNotification()
  //     if (!result?.ok) {
  //       snackbar.error(
  //         result?.message || 'Не удалось показать локальное уведомление'
  //       )
  //       return
  //     }
  //     snackbar.success('Локальное уведомление показано через Service Worker')
  //   } catch (error) {
  //     snackbar.error('Не удалось показать локальное уведомление')
  //   } finally {
  //     setPushBusy(false)
  //     setPushAction('')
  //     refreshPushState()
  //   }
  // }

  const saveAdditionalEventsPushTime = async (value) => {
    const nextValue = normalizeReminderTime(value)
    try {
      await saveCustom({ additionalEventsPushTime: nextValue })
      snackbar.success(`Время напоминаний: ${nextValue}`)
    } catch (error) {
      snackbar.error('Не удалось сохранить время напоминаний')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* <div className="text-sm text-gray-600">
        Push-уведомления приходят в установленное PWA-приложение по новым
        входящим API-заявкам и системным напоминаниям.
      </div>
      <div className="text-xs text-gray-500">
        Статус: {pushAvailable ? 'поддерживается' : 'не поддерживается'} |
        Разрешение: {pushPermission} | Подписка:{' '}
        {pushSubscribed ? 'активна' : 'нет'}
      </div> */}
      {pushDiagnosticMessage ? (
        <div className="text-xs text-amber-700">{pushDiagnosticMessage}</div>
      ) : null}
      {pushDiagnosticMessage?.includes('до минуты') ? (
        <div className="text-xs text-gray-500">
          Если это первая установка PWA на устройстве, подождите 30-60 секунд и
          попробуйте включить push снова.
        </div>
      ) : null}
      <div className="push-settings-surface tablet:grid-cols-2 grid gap-3 rounded border border-gray-200 bg-white/70 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-800">
              Уведомления аккаунта
            </span>
            <span
              className={`push-account-status inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
                isPushEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 bg-gray-100 text-gray-700'
              }`}
            >
              {isPushEnabled ? 'Включены' : 'Отключены'}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {activePushSubscriptions === null
              ? 'проверяем устройства...'
              : `Подключено ${formatPushDevicesCount(activePushSubscriptions)}: Web/PWA — ${activeWebPushSubscriptions}, мобильное приложение — ${activeMobilePushSubscriptions}.`}
          </div>
          {!isPushEnabled && Number(activePushSubscriptions || 0) > 0 ? (
            <button
              type="button"
              className="text-general min-h-10 cursor-pointer self-start font-semibold hover:underline"
              onClick={enablePushForAccount}
              disabled={pushBusy}
            >
              {pushBusy && pushAction === 'enable-account'
                ? 'Включаем...'
                : 'Включить уведомления аккаунта'}
            </button>
          ) : null}
        </div>
        <div className="tablet:border-l tablet:border-gray-200 tablet:pl-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-800">
              Это устройство
            </span>
            <span
              className={`push-device-status inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${devicePresentation.className}`}
            >
              {devicePresentation.label}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {devicePresentation.description}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`action-icon-button tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold ${
            pushSubscribed
              ? 'action-icon-button--danger'
              : 'action-icon-button--success'
          }`}
          onClick={() => {
            if (!pushAvailable || pushBusy) return
            if (pushSubscribed) disablePushOnThisDevice()
            else enablePushNotifications()
          }}
          disabled={
            pushBusy ||
            !pushAvailable ||
            (!pushSubscribed && pushPermission === 'denied')
          }
        >
          {pushBusy && pushAction === 'enable'
            ? 'Подключаем...'
            : pushBusy && pushAction === 'disable'
              ? 'Отключаем...'
              : pushSubscribed
                ? 'Отключить на этом устройстве'
                : 'Подключить это устройство'}
        </button>
        <button
          type="button"
          className="action-icon-button action-icon-button--warning tablet:w-auto flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
          onClick={sendTestPush}
          disabled={
            pushBusy ||
            !isPushEnabled ||
            Number(activeWebPushSubscriptions || 0) <= 0
          }
        >
          {pushBusy && pushAction === 'test' ? 'Отправка...' : 'Тест push'}
        </button>
        {isPushEnabled || Number(activePushSubscriptions || 0) > 0 ? (
          <button
            type="button"
            className="action-icon-button action-icon-button--danger tablet:w-auto flex min-h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
            onClick={disablePushOnAllDevices}
            disabled={pushBusy}
          >
            {pushBusy && pushAction === 'disable-all'
              ? 'Отключаем везде...'
              : 'Отключить на всех устройствах'}
          </button>
        ) : null}
        {/* <button
          type="button"
          className="flex items-center justify-center w-full h-10 px-3 text-sm font-semibold rounded cursor-pointer action-icon-button tablet:w-auto"
          onClick={sendLocalTestPush}
          disabled={pushBusy || !pushAvailable}
        >
          {pushBusy && pushAction === 'local-test'
            ? 'Показываем...'
            : 'Локальный тест'}
        </button> */}
      </div>
      <div className="push-settings-surface rounded border border-gray-200 bg-white/70 p-3">
        <label className="tablet:max-w-xs flex flex-col gap-2 text-sm text-gray-700">
          <span className="font-semibold text-gray-800">
            Время ежедневных напоминаний
          </span>
          <select
            value={additionalEventsPushTime}
            className="h-10 cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm"
            onChange={(event) =>
              saveAdditionalEventsPushTime(event.target.value)
            }
          >
            {TIME_OPTIONS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="push-settings-surface mt-2 rounded border border-gray-200 bg-white/70 p-3 text-xs">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-800">
            Последние события push
          </div>
          <button
            type="button"
            className="text-general cursor-pointer hover:underline"
            onClick={refreshPushLogs}
            disabled={pushLogsLoading}
          >
            {pushLogsLoading ? 'Обновляем...' : 'Обновить'}
          </button>
        </div>
        {pushLogs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {visiblePushLogs.map((log) => {
              const createdAt = log?.createdAt
                ? new Date(log.createdAt).toLocaleString('ru-RU')
                : ''
              const delivery = getPushDeliveryPresentation(log)
              return (
                <div
                  key={log._id}
                  className="push-settings-log-item rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span
                      className={`font-semibold ${delivery.className}`}
                      aria-label={delivery.label}
                    >
                      {delivery.symbol} {delivery.label}
                    </span>
                    <span className="text-gray-500">{createdAt}</span>
                  </div>
                  <div className="mt-2 font-semibold text-gray-800">
                    {getPushLogTitle(log)}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-gray-600">
                    {getPushLogBody(log)}
                  </div>
                </div>
              )
            })}
            {hasMorePushLogs ? (
              <button
                type="button"
                className="text-general min-h-10 cursor-pointer self-start font-semibold hover:underline"
                onClick={() => setShowAllPushLogs((current) => !current)}
                aria-expanded={showAllPushLogs}
              >
                {showAllPushLogs ? 'Скрыть' : 'Показать ещё'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="text-gray-500">
            Событий пока нет. Нажмите «Тест push», чтобы проверить доставку.
          </div>
        )}
      </div>
    </div>
  )
}

export default PushNotificationsSettings
