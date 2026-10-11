'use client'

import fieldHelp from '@helpers/fieldHelp.json'

import Button from '@components/Button'
import Input from '@components/Input'
import LoadingSpinner from '@components/LoadingSpinner'
import { getTariffFeatureLabels } from '@helpers/tariffFeatures'
import useSnackbar from '@helpers/useSnackbar'
import { useEffect, useMemo, useState } from 'react'

const EMPTY_FORM = {
  enabled: false,
  tariffId: '',
  durationDays: 14,
  welcomeMessage:
    'Добро пожаловать! Мы бесплатно подключили вам тариф «{tariff}» до {date}.',
}

const RegistrationTrialSettingsContent = ({ tariffs = [] }) => {
  const snackbar = useSnackbar()
  const [form, setForm] = useState(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/site/registration-trial', {
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success === false) {
          throw new Error(result?.error || 'Не удалось загрузить настройки')
        }
        if (cancelled) return
        const next = { ...EMPTY_FORM, ...result.data }
        setForm(next)
        setInitialForm(next)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Не удалось загрузить настройки')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedTariff = useMemo(
    () =>
      tariffs.find((item) => String(item?._id) === String(form.tariffId)) ??
      null,
    [form.tariffId, tariffs]
  )
  const featureLabels = useMemo(
    () => getTariffFeatureLabels(selectedTariff),
    [selectedTariff]
  )
  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm)

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }))

  const save = async () => {
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/site/registration-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Не удалось сохранить настройки')
      }
      const next = { ...form, ...result.data }
      setForm(next)
      setInitialForm(next)
      snackbar.success('Настройки пробного тарифа сохранены')
    } catch (saveError) {
      const message = saveError?.message || 'Не удалось сохранить настройки'
      setError(message)
      snackbar.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner text="Загрузка настроек..." />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Тариф для новых пользователей
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Тариф подключается бесплатно на заданный срок. Автоматического
            списания после окончания не будет.
          </p>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateForm({ enabled: event.target.checked })}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-general"
            />
            <span>
              <span className="block font-medium text-gray-900">
                Автоматически подключать пробный тариф
              </span>
              <span className="block text-sm text-gray-600">
                Настройка применяется только к новым регистрациям.
              </span>
            </span>
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Тариф
              <select
                value={form.tariffId}
                onChange={(event) => updateForm({ tariffId: event.target.value })}
                className="h-10 cursor-pointer rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:border-general"
              >
                <option value="">Выберите тариф</option>
                {tariffs.map((tariff) => (
                  <option key={tariff._id} value={tariff._id}>
                    {tariff.title} — {Number(tariff.price ?? 0)} ₽
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Срок, дней"
              help={fieldHelp['admin.trial']}
              type="number"
              min={1}
              max={365}
              fullWidth
              value={form.durationDays}
              onChange={(durationDays) => updateForm({ durationDays })}
            />
          </div>

          <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-gray-700">
            Приветственное сообщение
            <textarea
              value={form.welcomeMessage}
              maxLength={2000}
              rows={5}
              onChange={(event) =>
                updateForm({ welcomeMessage: event.target.value })
              }
              className="resize-y rounded-lg border border-gray-300 bg-white p-3 font-normal text-gray-900 outline-none focus:border-general"
              placeholder="Расскажите пользователю о пробном доступе"
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">
            Подстановки: {'{tariff}'} — тариф, {'{date}'} — дата окончания,{' '}
            {'{days}'} — срок, {'{functions}'} — список функций.
          </p>

          {selectedTariff ? (
            <div className="registration-trial-preview mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="font-medium text-green-900">
                Пользователь получит «{selectedTariff.title}» бесплатно
              </div>
              <div className="mt-1 text-sm text-green-800">
                {featureLabels.length > 0
                  ? featureLabels.join(' • ')
                  : 'В тарифе пока не включены дополнительные функции.'}
              </div>
            </div>
          ) : null}

          {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
          <div className="mt-5 flex justify-end">
            <Button
              name="Сохранить"
              onClick={save}
              loading={isSaving}
              disabled={!hasChanges || !form.tariffId}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

export default RegistrationTrialSettingsContent
