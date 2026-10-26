'use client'

import AiBadge from '@components/AiBadge'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import AppButton from '@components/AppButton'
import Textarea from '@components/Textarea'
import Input from '@components/Input'
import Notice from '@components/Notice'
import VoiceDraftOverlay from '@components/VoiceDraftOverlay'
import Modal from '@layouts/modals/Modal'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import { AI_EDIT_LABELS } from '@helpers/aiEditContract.mjs'
import { parseClipboardPhone, requestsClipboardPhone } from '@helpers/aiAssistantClipboard.mjs'
import { queryKeys } from '@helpers/queryKeys'

const valueLabel = (value, field) => {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (['amount', 'contractSum', 'depositExpectedAmount'].includes(field))
    return `${Number(value).toLocaleString('ru-RU')} ₽`
  if (['eventDate', 'dateEnd', 'depositDueAt', 'date'].includes(field))
    return new Date(value).toLocaleString('ru-RU')
  if (field === 'additionalEvents') return value.map((task) =>
    `${task.done ? '✓ ' : ''}${task.title || task.description} — ${task.date ? new Date(task.date).toLocaleString('ru-RU') : 'без даты'}`
  ).join('\n')
  if (field === 'address') return Object.entries(value).filter(([key, v]) => typeof v === 'string' && v && !key.startsWith('link')).map(([, v]) => v).join(', ') || 'Не указано'
  if (Array.isArray(value)) return value.join(', ') || 'Нет'
  return AI_EDIT_LABELS[value] || String(value)
}

const AssistantContent = ({ content, busy, dirty, setDisableConfirm, setDisableDecline, setOnShowOnCloseConfirmDialog }) => {
  useEffect(() => {
    setDisableConfirm(busy)
    setDisableDecline(busy)
    setOnShowOnCloseConfirmDialog(dirty)
  }, [busy, dirty, setDisableConfirm, setDisableDecline, setOnShowOnCloseConfirmDialog])
  return content
}

export default function AiEditAssistant({
  eventId: initialEventId = null, mode = 'text', unified = false,
  standaloneVoice = false,
  setOnShowOnCloseConfirmDialog, setDisableConfirm, setDisableDecline,
  setOnCloseButtonFunc, closeModal,
}) {
  const terms = useWorkItemTerminology()
  const queryClient = useQueryClient()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [eventId, setEventId] = useState(initialEventId)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(mode === 'voice')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [applyStarted, setApplyStarted] = useState(false)
  const [clipboardPhone, setClipboardPhone] = useState('')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const [pendingVoiceRequest, setPendingVoiceRequest] = useState(false)
  const prepareRef = useRef(null)
  const wantsClipboard = requestsClipboardPhone(text) || result?.needsClipboardPhone || Boolean(clipboardPhone)
  const closeVoice = useCallback(() => {
    if (standaloneVoice) closeModal?.()
    else setVoice(false)
  }, [standaloneVoice, closeModal])
  const receiveTranscript = useCallback((transcript) => {
    setText((current) => [current, transcript].filter(Boolean).join('\n'))
    setResult(null)
    setVoice(false)
    if (standaloneVoice) setPendingVoiceRequest(true)
  }, [standaloneVoice])

  useEffect(() => {
    setOnShowOnCloseConfirmDialog?.(Boolean(text && !result?.done))
    setDisableConfirm?.(busy || voice)
    setDisableDecline?.(busy || voice)
    setOnCloseButtonFunc?.(() => {
      if (busy || voice) return
      if (text && !result?.done) modalsFunc.confirm({ onConfirm: closeModal })
      else closeModal?.()
    })
  }, [text, result?.done, busy, voice, setOnShowOnCloseConfirmDialog, setDisableConfirm, setDisableDecline, setOnCloseButtonFunc, closeModal, modalsFunc])

  const request = async (body) => {
    const response = await fetch('/api/events/ai-edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Не удалось выполнить запрос'), { status: response.status })
    return payload
  }

  const readClipboard = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const phone = parseClipboardPhone(await navigator.clipboard.readText())
      if (!phone) throw new Error('В буфере должен быть один телефон. Скопируйте только номер или вставьте его в поле ниже.')
      setClipboardPhone(phone)
      setResult({ question: 'Телефон вставлен. Проверьте номер и продолжите обработку запроса.' })
    } catch (err) {
      setError(err instanceof TypeError || err?.name === 'NotAllowedError'
        ? 'Браузер не разрешил чтение буфера. Вставьте телефон вручную в поле ниже.' : err.message)
    } finally { inFlight.current = false; setBusy(false) }
  }
  const prepare = async (selectedId = eventId) => {
    if (inFlight.current) return
    if (wantsClipboard && !parseClipboardPhone(clipboardPhone)) {
      if (clipboardPhone) {
        setError('Укажите один корректный телефон клиента: 10 цифр или 11 цифр с 7/8.')
        return
      }
      await readClipboard()
      return
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const next = await request({ text, eventId: selectedId,
        ...(unified && !selectedId ? { mode: 'auto' } : {}),
        ...(clipboardPhone ? { clipboardPhone: parseClipboardPhone(clipboardPhone) } : {}),
      })
      if (!mounted.current) return
      if (unified && next.fields) {
        if (next.client?._id) {
          queryClient.setQueryData(queryKeys.client(next.client._id), next.client)
          await queryClient.invalidateQueries({ queryKey: ['clients'] })
        }
        if (!mounted.current) return
        closeModal?.()
        modalsFunc.event?.create?.(next.fields.status || 'draft', {
          initialEvent: { ...next.fields, status: next.fields.status || 'draft', description: next.fields.description || text },
          aiFilledFields: next.aiFilledFields || [], aiWarnings: next.aiWarnings || [], initialClient: next.client,
        })
        return
      }
      setResult(next)
      setApplyStarted(false)
    } catch (err) { setError(err.message) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const apply = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setApplyStarted(true)
    try {
      const next = await request({ mode: 'apply', planId: result.planId })
      setResult(next)
    } catch (err) {
      if ([404, 409].includes(err.status)) setResult((current) => ({ ...current, conflict: true, error: err.message }))
      else setError(`${err.message} Повторите применение этого плана для сверки результата.`)
    }
    finally {
      // A response may be lost after a successful write: refresh even on failure.
      await Promise.all(['events', 'event', 'clients', 'client', 'clientRelations', 'transactions', 'statistics', 'histories'].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key] })
      ))
      setBusy(false)
      inFlight.current = false
    }
  }
  const resetPlan = () => {
    setResult(null)
    setApplyStarted(false)
    setError('')
  }
  useEffect(() => {
    prepareRef.current = prepare
  })
  useEffect(() => {
    if (!pendingVoiceRequest) return
    setPendingVoiceRequest(false)
    prepareRef.current?.()
  }, [pendingVoiceRequest])

  if (standaloneVoice && voice)
    return <VoiceDraftOverlay onClose={closeVoice} onTranscript={receiveTranscript} />
  if (standaloneVoice && (pendingVoiceRequest || (busy && !result && !error)))
    return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 px-6 text-white" role="status">Обрабатываю запрос…</div>

  const content = (
    <div className="flex min-w-0 flex-col gap-4">
      {!standaloneVoice || !result?.planId ? <>
      <p>{unified ? `Опишите новую заявку или изменения ${terms.genitive}. ИИ определит действие: откроет заполненную форму или предложит выбрать запись и проверить изменения.` : `Опишите изменения ${terms.genitive}, клиента, оплат или задач. Сначала проверьте предложение, затем примените его.`}</p>
      <Textarea
        label={unified ? 'Что нужно создать или изменить?' : 'Что нужно изменить?'}
        ariaLabel={unified ? 'Что нужно создать или изменить?' : 'Что нужно изменить?'}
        value={text}
        onChange={(value) => { setText(value); setResult(null); setError(''); if (!initialEventId) setEventId(null) }}
        rows={5}
        maxLength={12000}
        disabled={busy || applyStarted || Boolean(result?.planId)}
        fullWidth
      />
      {wantsClipboard ? <div className="flex min-w-0 flex-col gap-2">
        <Input label="Телефон клиента из буфера" ariaLabel="Телефон клиента из буфера"
          value={clipboardPhone} onChange={(value) => { setClipboardPhone(value); setResult(null); setError(''); if (!initialEventId) setEventId(null) }}
          disabled={busy || applyStarted || Boolean(result?.planId)} fullWidth />
        {!result?.planId && !applyStarted ? <AppButton variant="secondary" disabled={busy} onClick={readClipboard}>Вставить телефон из буфера</AppButton> : null}
      </div> : null}
      {!result?.planId && !applyStarted ? (
        <div className="flex flex-wrap gap-2">
          <AppButton variant="secondary" disabled={busy} onClick={() => setVoice(true)}>Продиктовать<AiBadge /></AppButton>
          <AppButton disabled={busy || !text.trim()} onClick={() => prepare()}>
            {busy ? 'Подготавливаем…' : eventId ? 'Подготовить изменения' : unified ? 'Разобрать запрос' : `Найти ${terms.accusative}`}<AiBadge />
          </AppButton>
        </div>
      ) : null}
      </> : null}
      {voice ? <VoiceDraftOverlay onClose={closeVoice} onTranscript={receiveTranscript} /> : null}
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {result?.question ? <Notice tone="info">{result.question}</Notice> : null}
      {result?.candidates?.map((candidate) => (
        <AppButton key={candidate.id} variant="secondary" disabled={busy} onClick={() => {
          setEventId(candidate.id)
          prepare(candidate.id)
        }}>
          {candidate.client} · {candidate.title} · {candidate.date ? new Date(candidate.date).toLocaleString('ru-RU') : 'Без даты'}<AiBadge />
        </AppButton>
      ))}
      {result?.steps?.length ? (
        <div className="flex flex-col gap-3" aria-label="Предлагаемые изменения">
          <p className="font-semibold">{result.clientName ? `${result.clientName} · ` : ''}{result.eventTitle}{result.eventDate ? ` · ${new Date(result.eventDate).toLocaleString('ru-RU')}` : ''}</p>
          {result.steps.some((step) => step.entity === 'client') ? (
            <Notice tone="warning">Изменится общая карточка клиента. Эти данные используются и в других {terms.pluralPrepositional}.</Notice>
          ) : null}
          {result.steps.map((step, index) => (
            <section key={index} className="ui-surface-card min-w-0 rounded-lg p-3">
              <p className="mb-2 font-semibold">
                {step.entity === 'event' ? terms.labelCapitalized : step.entity === 'client' ? 'Клиент' : step.operation === 'create' ? 'Новая транзакция' : 'Транзакция'}
                {result.completed?.includes(index) ? ' · Выполнено' : ''}
              </p>
              {step.description ? <p className="mb-2 text-sm">{step.description}</p> : null}
              {step.changes.map((change) => (
                <div key={change.field} className="mb-3 min-w-0 break-words">
                  <p className="font-medium">{change.label}</p>
                  {step.operation !== 'create' ? <p className="whitespace-pre-wrap opacity-70">Было: {valueLabel(change.before, change.field)}</p> : null}
                  <p className="whitespace-pre-wrap">Станет: {valueLabel(change.after, change.field)}</p>
                </div>
              ))}
            </section>
          ))}
          {result.conflict ? <Notice tone="warning">{result.error}</Notice> : null}
          {result.done ? <Notice tone="success" role="status">Изменения сохранены</Notice> : (
            <div className="flex flex-wrap gap-2">
              <AppButton variant="secondary" disabled={busy || (applyStarted && !result.conflict)} onClick={resetPlan}>
                {result.conflict ? 'Подготовить оставшиеся заново' : 'Уточнить запрос'}
              </AppButton>
              {!result.conflict ? <AppButton disabled={busy} onClick={apply}>
                {busy ? 'Применяем…' : applyStarted ? 'Повторить / сверить' : 'Применить изменения'}
              </AppButton> : null}
            </div>
          )}
        </div>
      ) : null}
      {!result?.done ? <p className="text-sm opacity-70">Разбор, поиск и подготовка используют ИИ по условиям вашего тарифа. Применение готового плана не вызывает ИИ.{unified ? ' Для телефона из буфера скажите: «Возьми телефон клиента из буфера обмена». При подготовке новой заявки неизвестный номер создаёт карточку клиента.' : ''}</p> : null}
    </div>
  )
  return standaloneVoice ? (
    <Modal
      title={result?.planId ? 'Проверьте изменения' : 'Уточнение голосового запроса'}
      Children={AssistantContent}
      childrenProps={{ content, busy, dirty: Boolean(text && !result?.done) }}
      onlyCloseButtonShow
      crossActsAsDecline={false}
      crossShow={!busy}
      closeButtonShow={!busy}
      closeButtonName="Закрыть"
      onClose={() => { if (!busy) closeModal?.() }}
    />
  ) : content
}
