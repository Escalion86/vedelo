import { useState } from 'react'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import Notice from '@components/Notice'
import { apiJson } from '@helpers/apiClient'

const LocalAiCheck = ({ children, checked, onChange, disabled }) => (
  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed">
    <input
      type="checkbox"
      className="h-5 w-5 shrink-0 cursor-pointer accent-general focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      disabled={disabled}
    />
    {children}
  </label>
)

export default function LocalAiSettings({ provider, settings, saving, disabled, onSave }) {
  const isFu02 = provider === 'fu02'
  const isLegacyTranscriptionOnly = settings.aiTranscriptionProvider === 'local' &&
    settings.aiAnalysisProvider !== 'local'
  const [values, setValues] = useState({
    localAiEnabled: settings.localAiEnabled === true,
    localAiBaseUrl: settings.localAiBaseUrl || '',
    localAiModel: settings.localAiModel || '',
    localAiTranscriptionUrl: settings.localAiTranscriptionUrl || '',
    localAiTimeoutMs: String(settings.localAiTimeoutMs ?? ''),
  })
  const [useLocalTranscription, setUseLocalTranscription] = useState(
    settings.aiTranscriptionProvider === 'local'
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const busy = saving || testing || disabled
  const timeoutText = values.localAiTimeoutMs.trim()
  const timeout = timeoutText ? Number(timeoutText) : null
  const invalidTimeout = timeout !== null &&
    (!/^\d+$/.test(timeoutText) || timeout < 1000 || timeout > 120000)

  const setValue = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setSaveError('')
    if (name === 'localAiBaseUrl' || name === 'localAiModel') setTestResult(null)
  }

  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    setShowValidation(true)
    if (invalidTimeout) return
    setSaveError('')
    try {
      if (isFu02) {
        await onSave({
          aiTranscriptionProvider: 'fu02',
          localAiEnabled: true,
          localAiTranscriptionUrl: values.localAiTranscriptionUrl,
          localAiTimeoutMs: timeout,
        })
        return
      }
      const transcriptionProvider = useLocalTranscription
        ? 'local'
        : ['local', 'fu02'].includes(settings.aiTranscriptionProvider)
          ? settings.aiTranscriptionFallbackProvider || ''
          : undefined
      await onSave({
        ...values,
        localAiTimeoutMs: timeout,
        ...(isLegacyTranscriptionOnly ? {} : { aiAnalysisProvider: 'local' }),
        ...(transcriptionProvider === undefined ? {} : { aiTranscriptionProvider: transcriptionProvider }),
      })
    } catch (error) {
      setSaveError(error.message || (isFu02
        ? 'Не удалось сохранить настройки ИИ Ведело Fu02'
        : 'Не удалось сохранить настройки локального ИИ'))
    }
  }

  const testConnection = async () => {
    if (busy) return
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await apiJson('/api/ai/local-test', {
        method: 'POST',
        body: JSON.stringify({
          localAiBaseUrl: values.localAiBaseUrl,
          localAiModel: values.localAiModel,
        }),
      }))
    } catch (error) {
      setTestResult({ success: false, error: error.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form className="flex min-w-0 flex-col gap-3" onSubmit={save} aria-busy={saving || testing}>
      {isFu02 ? null : (
        <div>
          <LocalAiCheck
            checked={values.localAiEnabled}
            onChange={(value) => setValue('localAiEnabled', value)}
            disabled={busy}
          >
            Включить локальный ИИ
          </LocalAiCheck>
          <LocalAiCheck
            checked={useLocalTranscription}
            onChange={(value) => {
              setUseLocalTranscription(value)
              setSaveError('')
            }}
            disabled={busy || !values.localAiEnabled}
          >
            Распознавать аудио локально
          </LocalAiCheck>
        </div>
      )}
      <p className="text-sm text-[var(--ui-secondary-text)]">
        {isFu02
          ? 'Голосовой ввод распознаёт Fu02. Текст разбирает «ИИ Ведело» по условиям тарифа. Если Fu02 недоступен, выберите «ИИ Ведело» для облачного распознавания.'
          : 'Если локальный сервис недоступен, запрос обработает облачный провайдер.'}
      </p>
      <div className="tablet:grid-cols-2 grid grid-cols-1 gap-3">
        {isFu02 ? null : (
          <>
            <Input
              label="Базовый URL чата"
              ariaLabel="Базовый URL чата"
              placeholder="http://127.0.0.1:18010/v1"
              value={values.localAiBaseUrl}
              onChange={(value) => setValue('localAiBaseUrl', value)}
              disabled={busy}
              noMargin
              fullWidth
            />
            <Input
              label="Локальная модель"
              ariaLabel="Локальная модель"
              value={values.localAiModel}
              onChange={(value) => setValue('localAiModel', value)}
              disabled={busy}
              noMargin
              fullWidth
            />
          </>
        )}
        <Input
          label="URL распознавания аудио"
          ariaLabel="URL распознавания аудио"
          placeholder="http://127.0.0.1:18011/v1/audio/transcriptions"
          value={values.localAiTranscriptionUrl}
          onChange={(value) => setValue('localAiTranscriptionUrl', value)}
          disabled={busy}
          noMargin
          fullWidth
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Input
            label="Таймаут, мс"
            ariaLabel="Таймаут, мс"
            help="От 1000 до 120000 мс. При пустом поле используется настройка сервера."
            placeholder="20000"
            value={values.localAiTimeoutMs}
            onChange={(value) => setValue('localAiTimeoutMs', value)}
            error={showValidation && invalidTimeout}
            disabled={busy}
            noMargin
            fullWidth
          />
          {showValidation && invalidTimeout ? (
            <p className="text-danger text-sm" role="alert">
              Укажите целое число от 1000 до 120000 мс
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <AppButton type="submit" disabled={busy}>
          {saving ? 'Сохраняем…' : 'Сохранить настройки'}
        </AppButton>
        {isFu02 ? null : (
          <AppButton variant="secondary" disabled={busy} onClick={testConnection}>
            {testing ? 'Проверяем…' : 'Проверить подключение'}
          </AppButton>
        )}
      </div>
      {saveError ? <Notice tone="error" role="alert">{saveError}</Notice> : null}
      {testResult ? (
        <Notice
          tone={testResult.success ? 'success' : 'error'}
          role="status"
          className="wrap-anywhere whitespace-pre-wrap"
        >
          {testResult.success
            ? `${testResult.model} · ${testResult.latencyMs} мс`
            : testResult.error || 'Не удалось проверить подключение'}
        </Notice>
      ) : null}
    </form>
  )
}
