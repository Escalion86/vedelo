'use client'

import { useEffect, useState } from 'react'
import Button from '@components/Button'
import Input from '@components/Input'
import LoadingSpinner from '@components/LoadingSpinner'
import MutedText from '@components/MutedText'
import Notice from '@components/Notice'
import { formatMoney } from '@helpers/formatMoney'
import useSnackbar from '@helpers/useSnackbar'

const FEATURE_LABELS = {
  call_transcription: 'Расшифровка звонка',
  call_analysis: 'Анализ звонка',
  voice_transcription: 'Голосовой ввод',
  event_draft: 'Черновик мероприятия',
  calendar_import: 'Импорт Google Calendar',
  file_analysis: 'Анализ файла',
  file_import: 'Импорт из файла',
}

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('ru-RU') : '—'

const Metric = ({ label, value, hint }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="text-sm text-gray-500">{label}</div>
    <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
  </div>
)

const AiUsageAdminContent = () => {
  const snackbar = useSnackbar()
  const [settings, setSettings] = useState(null)
  const [coefficient, setCoefficient] = useState('1.5')
  const [initialCoefficient, setInitialCoefficient] = useState(1.5)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [settingsResponse, reportResponse] = await Promise.all([
        fetch('/api/ai/settings', { cache: 'no-store' }),
        fetch('/api/ai/usage?scope=admin', { cache: 'no-store' }),
      ])
      const [settingsResult, reportResult] = await Promise.all([
        settingsResponse.json().catch(() => ({})),
        reportResponse.json().catch(() => ({})),
      ])
      if (!settingsResponse.ok) {
        throw new Error(settingsResult?.error || 'Не удалось загрузить настройки')
      }
      if (!reportResponse.ok) {
        throw new Error(reportResult?.error || 'Не удалось загрузить расходы')
      }
      const nextCoefficient = Number(
        settingsResult?.data?.markupCoefficient ?? 1.5
      )
      setSettings(settingsResult.data)
      setCoefficient(String(nextCoefficient))
      setInitialCoefficient(nextCoefficient)
      setReport(reportResult.data)
    } catch (loadError) {
      setError(loadError?.message || 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Первичный HTTP-запрос выставляет loading до ответа сервера.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const save = async () => {
    const coefficientValue = Number(String(coefficient).replace(',', '.'))
    if (
      !Number.isFinite(coefficientValue) ||
      coefficientValue < 1 ||
      coefficientValue > 10
    ) {
      setError('Коэффициент должен быть от 1 до 10')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markupCoefficient: coefficientValue }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result?.error || 'Не удалось сохранить коэффициент')
      }
      const nextCoefficient = Number(result.data.markupCoefficient)
      setSettings(result.data)
      setCoefficient(String(nextCoefficient))
      setInitialCoefficient(nextCoefficient)
      snackbar.success('Коэффициент наценки сохранён')
    } catch (saveError) {
      const message = saveError?.message || 'Не удалось сохранить коэффициент'
      setError(message)
      snackbar.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner text="Загрузка расходов на ИИ..." />
      </div>
    )
  }

  const summary = report?.summary || {}
  const coefficientValue = Number(String(coefficient).replace(',', '.'))
  const coefficientIsValid =
    Number.isFinite(coefficientValue) &&
    coefficientValue >= 1 &&
    coefficientValue <= 10

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {error ? (
          <Notice tone="error" role="alert" className="p-3">
            {error}
          </Notice>
        ) : null}

        <div className="flex max-w-2xl flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              Тарификация ИИ Ведело
            </div>
            <MutedText as="p" className="mt-1 text-gray-500">
              Пользователь оплачивает фактическую стоимость AITunnel, умноженную
              на этот коэффициент. Перед запросом резервируется средняя стоимость
              аналогичных операций.
            </MutedText>
          </div>
          <Notice
            tone={settings?.platformConfigured ? 'success' : 'error'}
            className="rounded-md"
          >
            {settings?.platformConfigured
              ? 'Общий ключ AITunnel настроен.'
              : 'Общий ключ AITUNNEL_KEY не настроен — сервисный ИИ недоступен.'}
          </Notice>
          <Input
            label="Коэффициент наценки"
            type="number"
            min={1}
            max={10}
            step={0.01}
            decimalScale={2}
            value={coefficient}
            onChange={setCoefficient}
            noMargin
            fullWidth
            className="max-w-80"
          />
          <div className="flex justify-end">
            <Button
              name="Сохранить"
              onClick={save}
              disabled={
                !coefficientIsValid ||
                coefficientValue === initialCoefficient ||
                saving
              }
              loading={saving}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-4">
          <Metric label="Себестоимость" value={formatMoney(summary.providerCost || 0)} />
          <Metric label="Списано с пользователей" value={formatMoney(summary.charged || 0)} />
          <Metric label="Маржа" value={formatMoney(summary.margin || 0)} />
          <Metric
            label="Операции"
            value={summary.operations || 0}
            hint={summary.uncovered ? `Не покрыто: ${formatMoney(summary.uncovered)}` : ''}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4 text-lg font-semibold">
              По функциям
            </div>
            <div className="overflow-x-auto p-4">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr><th className="pb-2 pr-3">Функция</th><th className="pb-2 pr-3">Запросы</th><th className="pb-2 pr-3">Себестоимость</th><th className="pb-2">Списано</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(report?.breakdown || []).map((row) => (
                    <tr key={row.feature}>
                      <td className="py-2 pr-3">{FEATURE_LABELS[row.feature] || row.feature}</td>
                      <td className="py-2 pr-3">{row.operations}</td>
                      <td className="py-2 pr-3">{formatMoney(row.providerCost)}</td>
                      <td className="py-2">{formatMoney(row.charged)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4 text-lg font-semibold">
              По пользователям
            </div>
            <div className="max-h-96 overflow-auto p-4">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr><th className="pb-2 pr-3">Пользователь</th><th className="pb-2 pr-3">Запросы</th><th className="pb-2 pr-3">Списано</th><th className="pb-2">Баланс</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(report?.users || []).map((row) => (
                    <tr key={row.tenantId}>
                      <td className="py-2 pr-3"><div>{row.name}</div><div className="text-xs text-gray-500">{row.email}</div></td>
                      <td className="py-2 pr-3">{row.operations}</td>
                      <td className="py-2 pr-3">{formatMoney(row.charged)}</td>
                      <td className="py-2">{formatMoney(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4 text-lg font-semibold">
            Последние операции
          </div>
          <div className="overflow-x-auto p-4">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-gray-500 uppercase">
                <tr><th className="pb-2 pr-3">Дата</th><th className="pb-2 pr-3">Функция</th><th className="pb-2 pr-3">Статус</th><th className="pb-2 pr-3">Себестоимость</th><th className="pb-2">Списано</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(report?.recent || []).map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="py-2 pr-3">{FEATURE_LABELS[row.feature] || row.feature}</td>
                    <td className="py-2 pr-3">{row.status}</td>
                    <td className="py-2 pr-3">{formatMoney(row.providerCost)}</td>
                    <td className="py-2">{formatMoney(row.charged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AiUsageAdminContent
