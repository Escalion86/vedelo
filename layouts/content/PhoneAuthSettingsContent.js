'use client'

import { useEffect, useState } from 'react'
import AppButton from '@components/AppButton'
import ComboBox from '@components/ComboBox'
import LoadingSpinner from '@components/LoadingSpinner'
import Notice from '@components/Notice'
import useSnackbar from '@helpers/useSnackbar'

const methods = [
  { value: 'call', name: 'Звонок' },
  { value: 'sms', name: 'СМС' },
]

export default function PhoneAuthSettingsContent() {
  const snackbar = useSnackbar()
  const [settings, setSettings] = useState(null)
  const [method, setMethod] = useState('call')
  const [vkEnabled, setVkEnabled] = useState(false)
  const [yandexEnabled, setYandexEnabled] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshBalance = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/site/phone-auth', {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) throw new Error('Не удалось обновить баланс')
      setSettings((previous) => ({
        ...previous,
        telefonipBalance: result.data.telefonipBalance,
      }))
    } catch {
      snackbar.error('Не удалось обновить баланс')
    } finally {
      setRefreshing(false)
    }
  }
  useEffect(() => {
    let active = true
    fetch('/api/site/phone-auth', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(
            result?.error?.message || 'Не удалось загрузить настройки'
          )
        if (active) {
          setSettings(result.data)
          setMethod(result.data.primaryMethod)
          setVkEnabled(result.data.vkEnabled)
          setYandexEnabled(result.data.yandexEnabled)
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message)
      })
    return () => {
      active = false
    }
  }, [])
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/site/phone-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryMethod: method, vkEnabled, yandexEnabled }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result?.error?.message || 'Не удалось сохранить настройки'
        )
      setSettings((previous) => ({ ...previous, ...result.data }))
      snackbar.success('Настройки авторизации сохранены')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        {!settings && !error && <LoadingSpinner text="Загрузка настроек..." />}
        {settings && (
          <>
            <p>
              Основной способ подтверждения телефона при регистрации и
              восстановлении пароля в Web/PWA. Вход с паролем остаётся доступен.
            </p>
            <ComboBox
              label="Подтверждение телефона"
              items={methods}
              value={method}
              onChange={setMethod}
              disabled={saving}
              fullWidth
              noMargin
            />
            <Notice tone="info">
              {method === 'sms'
                ? 'Код приходит по СМС сразу после запроса. Предварительный звонок не требуется.'
                : 'Сначала предлагается бесплатный звонок. Через 60 секунд можно запросить код по СМС.'}
            </Notice>
            <p className="text-sm">
              СМС:{' '}
              {settings.smsConfigured
                ? `настроено (${settings.smsProvider === 'telefonip' ? 'Telefon-IP' : 'внешний сервис'})`
                : 'провайдер не настроен'}
              . Звонки: {settings.callConfigured ? 'настроены' : 'не настроены'}
              .
            </p>
            <p className="text-sm">
              Наличие ключа не подтверждает доставку: для отправки СМС услуга
              должна быть доступна в аккаунте провайдера и на балансе должно
              быть достаточно средств.
            </p>
            <Notice
              tone={
                ['low', 'error'].includes(settings.telefonipBalance?.status)
                  ? 'warning'
                  : 'info'
              }
            >
              <p className="font-semibold">Баланс Telefon-IP</p>
              <p>
                {['ok', 'low'].includes(settings.telefonipBalance?.status)
                  ? `${settings.telefonipBalance.balance.toLocaleString('ru-RU')} ₽`
                  : settings.telefonipBalance?.status === 'unconfigured'
                    ? 'Ключ Telefon-IP не настроен'
                    : 'Не удалось получить баланс. Повторите проверку.'}
              </p>
              {settings.telefonipBalance?.checkedAt && (
                <p className="text-sm">
                  Проверка:{' '}
                  {new Date(settings.telefonipBalance.checkedAt).toLocaleString(
                    'ru-RU'
                  )}
                </p>
              )}
              <p className="text-sm">
                При остатке 100 ₽ или меньше разработчикам отправляется push
                вместе с проверкой подписок, не чаще раза в сутки. Для получения
                уведомлений включите push на своём устройстве.
              </p>
            </Notice>
            <AppButton
              variant="secondary"
              className="self-start"
              onClick={refreshBalance}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              {refreshing ? 'Проверка…' : 'Обновить баланс'}
            </AppButton>
            <h2 className="text-lg font-semibold">Вход через внешние сервисы</h2>
            <AppButton variant="secondary" role="switch" aria-label="Разрешить вход через VK ID"
              aria-checked={vkEnabled} onClick={() => setVkEnabled((value) => !value)}
              disabled={saving || (!settings.vkConfigured && !vkEnabled)}>
              VK ID: {vkEnabled ? 'включён' : 'отключён'}
            </AppButton>
            <p className="text-sm">VK ID: {settings.vkConfigured ? 'ключи на сервере настроены' : 'сначала задайте VK_ID_APP_ID, VK_ID_CLIENT_SECRET и VK_ID_REDIRECT_URI на сервере'}.</p>
            <AppButton variant="secondary" role="switch" aria-label="Разрешить вход через Яндекс ID"
              aria-checked={yandexEnabled} onClick={() => setYandexEnabled((value) => !value)}
              disabled={saving || (!settings.yandexConfigured && !yandexEnabled)}>
              Яндекс ID: {yandexEnabled ? 'включён' : 'отключён'}
            </AppButton>
            <p className="text-sm">Яндекс ID: {settings.yandexConfigured ? 'ключи на сервере настроены' : 'сначала задайте YANDEX_ID_CLIENT_ID, YANDEX_ID_CLIENT_SECRET и YANDEX_ID_REDIRECT_URI на сервере'}.</p>
            <Notice tone="info">
              Переключатели скрывают способы входа и запрещают новые входы через их API.
              Уже открытые сессии сохраняются. Яндекс автоматически открывает
              существующий аккаунт по номеру из Яндекс ID. Для нового номера нужна регистрация.
              Секреты хранятся только в окружении сервера.
            </Notice>
            <AppButton
              className="self-start"
              onClick={save}
              disabled={saving || (method === settings.primaryMethod && vkEnabled === settings.vkEnabled && yandexEnabled === settings.yandexEnabled)}
              aria-busy={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </AppButton>
          </>
        )}
      </div>
    </div>
  )
}
