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
        body: JSON.stringify({ primaryMethod: method }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result?.error?.message || 'Не удалось сохранить настройки'
        )
      setSettings((previous) => ({ ...previous, ...result.data }))
      snackbar.success('Способ подтверждения сохранён')
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
              восстановлении пароля в Web/PWA. Вход с паролем и VK ID остаётся
              доступен.
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
            <AppButton
              className="self-start"
              onClick={save}
              disabled={saving || method === settings.primaryMethod}
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
