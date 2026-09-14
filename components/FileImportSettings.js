'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import Notice from '@components/Notice'
import { validateImportFile } from '@helpers/fileImport.mjs'
import { queryKeys } from '@helpers/queryKeys'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const rub = (amount) =>
  `${Number(amount || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
const button =
  'cursor-pointer rounded border border-current px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-general text-white border-transparent`
const input = 'w-full rounded border border-gray-500 bg-transparent p-2 text-sm'
const statusLabels = {
  pending: 'Ожидает импорта',
  processing: 'Обрабатывается',
  created: 'Создано',
  duplicate: 'Уже импортировано',
  possible_duplicate: 'Возможный дубль',
  needs_attention: 'Нужно уточнение',
  error: 'Ошибка',
  analyzing: 'Анализ',
  importing: 'Импорт',
  uploaded: 'Файл загружен',
  review: 'Проверка структуры',
  quoted: 'Смета готова',
  paused: 'Приостановлен',
  completed: 'Завершён',
  failed: 'Ошибка анализа',
}
const api = async (url, options) => {
  const response = await fetch(url, { cache: 'no-store', ...options })
  const payload = await response.json()
  if (!response.ok || !payload.success)
    throw new Error(payload.error || 'Не удалось выполнить запрос.')
  return payload.data
}

const FileImportSettings = () => {
  const terms = useWorkItemTerminology()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const user = useAtomValue(loggedUserAtom)
  const queryClient = useQueryClient()
  const [job, setJob] = useState(null)
  const [history, setHistory] = useState([])
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [answers, setAnswers] = useState({})
  const [selectedIds, setSelectedIds] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editRules, setEditRules] = useState(false)
  const active = ['analyzing', 'importing'].includes(job?.status)
  const acceptJob = useCallback((next, reset = false) => {
    setJob(next)
    if (reset) {
      setAnswers(next.answers || {})
      setSelectedIds(next.selectedIds || [])
    }
  }, [])
  const refreshHistory = useCallback(
    () =>
      api('/api/events/file-import')
        .then(setHistory)
        .catch((e) => setError(e.message)),
    []
  )
  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])
  useEffect(() => {
    if (!active || !job?.id) return
    let stopped = false
    let timer
    const poll = async () => {
      try {
        const next = await api(`/api/events/file-import?id=${job.id}`)
        if (stopped) return
        acceptJob(next, next.status === 'review')
        if (!['analyzing', 'importing'].includes(next.status)) {
          queryClient.invalidateQueries({ queryKey: ['events'] })
          queryClient.invalidateQueries({ queryKey: ['clients'] })
          refreshHistory()
        }
      } catch (e) {
        if (!stopped) setError(e.message)
      }
      if (!stopped) timer = setTimeout(poll, 4000)
    }
    timer = setTimeout(poll, 1500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [active, job?.id, acceptJob, queryClient, refreshHistory])
  const run = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const action = (name, extra = {}) =>
    run(async () => {
      const next = await api(`/api/events/file-import/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: name,
          quoteId: job.quote?.id,
          ...extra,
        }),
      })
      acceptJob(next, name === 'quote')
      if (name === 'quote') setEditRules(false)
      refreshHistory()
    })
  const upload = () =>
    run(async () => {
      validateImportFile(file?.name, file?.size)
      const data = new FormData()
      data.set('file', file)
      data.set('note', note)
      acceptJob(
        await api('/api/events/file-import', { method: 'POST', body: data }),
        true
      )
      setEditRules(false)
      refreshHistory()
    })
  const openEvent = (id) =>
    run(async () => {
      const event = await api(`/api/events/${id}`)
      queryClient.setQueryData(queryKeys.event(id), event)
      modalsFunc.event?.edit(id)
    })
  const required = (job?.quote?.amountKopecks || 0) / 100
  const shortage = Math.max(0, required - Number(job?.balanceRub || 0))
  const canPay = shortage === 0
  const stage = active
    ? job.status === 'analyzing'
      ? 1
      : 3
    : job?.status === 'quoted' && !editRules
      ? 2
      : ['completed', 'paused'].includes(job?.status) && !editRules
        ? 3
        : 1
  const showRules = job?.analysis && !active && (stage === 1 || editRules)
  const readyAnswers = (job?.analysis?.questions || []).every((q) =>
    answers[q.id]?.trim()
  )
  const finished = (job?.records || []).filter((record) =>
    [
      'created',
      'duplicate',
      'possible_duplicate',
      'needs_attention',
      'error',
    ].includes(record.status)
  ).length
  const payment =
    job && !active ? (
      <div className="space-y-2">
        <p>
          Доступный баланс: <strong>{rub(job.balanceRub)}</strong>
        </p>
        {shortage > 0 ? (
          <Notice tone="warning">
            Не хватает {rub(shortage)}. Анализ и ответы сохранятся после
            пополнения.
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={() => modalsFunc.user?.topupInfo(user?._id)}
          >
            Пополнить баланс
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              run(async () =>
                acceptJob(await api(`/api/events/file-import?id=${job.id}`))
              )
            }
          >
            Обновить баланс
          </button>
        </div>
      </div>
    ) : null

  return (
    <section
      className="mx-auto w-full max-w-4xl space-y-4 pb-6"
      aria-label="Импорт из файла"
    >
      <div>
        <h2 className="text-lg font-semibold">Импорт {terms.pluralGenitive} из файла</h2>
        <p className="text-sm opacity-80">
          XLSX, CSV, TXT и DOCX без обязательного шаблона. До 5 МБ и 100
          {terms.pluralGenitive}.
        </p>
      </div>
      <ol className="file-import-progress" aria-label="Этапы импорта">
        {['Анализ и уточнения', 'Стоимость', 'Импорт'].map((label, index) => (
          <li
            key={label}
            aria-current={stage === index + 1 ? 'step' : undefined}
            className="file-import-progress__step"
            data-complete={stage > index + 1 ? 'true' : undefined}
          >
            <span className="shrink-0">{index + 1}.</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {history.length > 0 ? (
        <label className="block text-sm">
          Сохранённые импорты
          <select
            className={`${input} mt-1 cursor-pointer`}
            value={job?.id || ''}
            disabled={busy || active}
            onChange={(e) => {
              const id = e.target.value
              if (id)
                run(async () => {
                  acceptJob(await api(`/api/events/file-import?id=${id}`), true)
                  setEditRules(false)
                })
            }}
          >
            <option value="">Выберите импорт</option>
            {history.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fileName} · {statusLabels[item.status]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!job ? (
        <div className="space-y-3">
          <label className="block text-sm">
            Файл
            <input
              type="file"
              accept=".xlsx,.csv,.txt,.docx"
              className={`${input} mt-1 cursor-pointer`}
              onChange={(e) => {
                setError('')
                const next = e.target.files?.[0]
                try {
                  if (next) validateImportFile(next.name, next.size)
                  setFile(next || null)
                } catch (err) {
                  setFile(null)
                  setError(err.message)
                }
              }}
            />
          </label>
          <label className="block text-sm">
            Пояснение к файлу — необязательно
            <textarea
              className={`${input} mt-1`}
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: каждый лист — месяц, все даты за 2026 год."
            />
          </label>
          <Notice tone="info">
            PDF, сканы и изображения не принимаются. Встроенные изображения
            пропускаются. Проверка формата бесплатна; стоимость анализа будет
            показана до запуска ИИ. Текст файла передаётся выбранному
            ИИ-провайдеру и хранится для продолжения импорта до 30 дней.
          </Notice>
          <button
            type="button"
            className={primary}
            disabled={busy || !file}
            onClick={upload}
          >
            {busy ? 'Проверяем файл…' : 'Загрузить файл'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 font-medium break-all">{job.fileName}</p>
            <button
              type="button"
              className={button}
              disabled={active || busy}
              onClick={() => {
                setJob(null)
                setError('')
                setEditRules(false)
              }}
            >
              Другой файл
            </button>
          </div>
          {job.warnings?.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}
          {job.error ? <Notice tone="warning">{job.error}</Notice> : null}
          {job.refundPending ? (
            <Notice tone="warning">
              Остаток резерва: {rub(job.reservedRub)}.{' '}
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => action('release')}
              >
                Завершить возврат резерва
              </button>
            </Notice>
          ) : null}
          {!job.analysis && !active ? (
            <div className="space-y-3">
              <p>
                {job.quote?.provider === 'artistcrm' ? (
                  <>
                    Анализ файла: ориентировочно {rub(required)}, списание не
                    более этой суммы.
                  </>
                ) : (
                  'Анализ оплачивается по личному ключу ИИ-провайдера. Ведело не списывает средства.'
                )}
              </p>
              {job.quote?.provider === 'artistcrm' ? payment : null}
              <button
                type="button"
                className={primary}
                disabled={busy || !canPay}
                onClick={() => action('analyze')}
              >
                Проанализировать файл
              </button>
              <button
                type="button"
                className={`${button} ml-2`}
                disabled={busy}
                onClick={() => action('refresh')}
              >
                Обновить расчёт
              </button>
            </div>
          ) : null}
          {active ? (
            <Notice tone="info" role="status">
              <p>
                {job.status === 'analyzing'
                  ? 'ИИ изучает структуру файла…'
                  : `Обработка ${terms.pluralGenitive}: ${finished} из ${job.records.length}`}
              </p>
              <p className="mt-1 text-sm">
                Прогресс сохраняется на сервере. После возвращения откройте этот
                импорт из списка.
              </p>
              <button
                type="button"
                className={`${button} mt-2`}
                disabled={busy}
                onClick={() => action('stop')}
              >
                Остановить после текущего запроса
              </button>
            </Notice>
          ) : null}
          {showRules ? (
            <div className="space-y-4">
              <Notice tone="info">
                <p className="font-medium">Как ИИ понял файл</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {job.analysis.summary}
                </p>
              </Notice>
              <details>
                <summary className="cursor-pointer">Правила заполнения</summary>
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {job.analysis.rules}
                </p>
              </details>
              {job.analysis.examples?.length ? (
                <div className="space-y-2">
                  <p className="font-medium">Примеры распознавания</p>
                  {job.analysis.examples.map((example, index) => (
                    <Notice key={index} tone="neutral">
                      {example}
                    </Notice>
                  ))}
                </div>
              ) : null}
              {job.analysis.questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <label className="block text-sm" htmlFor={`file-${q.id}`}>
                    {q.question}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set([...q.options, 'Не знаю'])].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={answers[q.id] === value ? primary : button}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [q.id]: value,
                          }))
                        }
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <input
                    id={`file-${q.id}`}
                    className={input}
                    maxLength={1000}
                    value={answers[q.id] || ''}
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [q.id]: e.target.value,
                      }))
                    }
                    placeholder="Ответ или своё пояснение"
                  />
                </div>
              ))}
              <label className="block text-sm">
                Дополнительные правила и исправления
                <textarea
                  className={`${input} mt-1`}
                  rows={3}
                  maxLength={2000}
                  value={answers.comment || ''}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      comment: e.target.value,
                    }))
                  }
                  placeholder="Например: даты без года относятся к 2026 году."
                />
              </label>
              <p className="text-sm">
                Выберите записи ниже. Неуточнённые даты будут отложены, суммы
                оплат сохранятся для проверки без создания транзакций.
              </p>
            </div>
          ) : null}
          {job.records?.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium">
                Записи: {job.records.length}
                {showRules ? ` · выбрано ${selectedIds.length}` : ''}
              </p>
              {job.records.map((record) => (
                <details
                  key={record.id}
                  className="rounded border border-gray-500 p-3"
                >
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    {showRules &&
                    !['created', 'duplicate'].includes(record.status) ? (
                      <input
                        type="checkbox"
                        aria-label={`Импортировать: ${record.title}`}
                        className="h-5 w-5 cursor-pointer"
                        checked={selectedIds.includes(record.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedIds((ids) =>
                            e.target.checked
                              ? [...ids, record.id]
                              : ids.filter((id) => id !== record.id)
                          )
                        }
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 break-words">
                      {record.title}
                    </span>
                    <span className="text-xs opacity-80">
                      {statusLabels[record.status]}
                    </span>
                  </summary>
                  <pre className="mt-2 text-xs break-words whitespace-pre-wrap">
                    {record.source}
                  </pre>
                  {record.error ? (
                    <Notice className="mt-2" tone="warning">
                      {record.error}
                    </Notice>
                  ) : null}
                  {record.warnings.map((warning) => (
                    <p key={warning} className="mt-1 text-sm">
                      {warning}
                    </p>
                  ))}
                  {record.eventId ? (
                    <button
                      type="button"
                      className={`${button} mt-2`}
                      disabled={busy}
                      onClick={() => openEvent(record.eventId)}
                    >
                      Открыть {terms.accusative}
                    </button>
                  ) : null}
                </details>
              ))}
            </div>
          ) : null}
          {job.ignored?.length > 0 && showRules ? (
            <details>
              <summary className="cursor-pointer text-sm">
                Строки вне {terms.pluralGenitive}: {job.ignored.length} — проверьте, что
                ничего не потеряно
              </summary>
              <pre className="mt-2 text-xs break-words whitespace-pre-wrap">
                {job.ignored
                  .map((line) => `${line.section}: ${line.text}`)
                  .join('\n')}
              </pre>
            </details>
          ) : null}
          {showRules ? (
            <button
              type="button"
              className={primary}
              disabled={busy || !selectedIds.length || !readyAnswers}
              onClick={() => action('quote', { answers, selectedIds })}
            >
              Всё верно, рассчитать стоимость
            </button>
          ) : null}
          {stage === 2 ? (
            <div className="space-y-3">
              <p className="font-medium">
                Записей к импорту: {job.quote.count}
              </p>
              <p>Уже потрачено на анализ: {rub(job.analysisCostRub)}</p>
              <Notice tone="info">
                {job.quote.provider === 'artistcrm' ? (
                  <>
                    Ориентировочная стоимость оставшейся обработки:{' '}
                    <strong>{rub(required)}</strong>. Это также предел списания.
                    Сумма резервируется при запуске, остаток возвращается после
                    завершения или остановки.
                  </>
                ) : (
                  'Используется личный ключ. Ведело не списывает средства; стоимость запросов определяет ваш провайдер.'
                )}
              </Notice>
              {job.quote.provider === 'artistcrm' ? payment : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primary}
                  disabled={busy || !canPay}
                  onClick={() => action('start')}
                >
                  Импортировать: {job.quote.count}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => setEditRules(true)}
                >
                  Изменить правила и выбор
                </button>
              </div>
            </div>
          ) : null}
          {stage === 3 && !active ? (
            <Notice tone={job.status === 'paused' ? 'warning' : 'success'}>
              <p>
                Создано:{' '}
                {
                  job.records.filter((record) => record.status === 'created')
                    .length
                }
                . Пропущено или требует уточнения:{' '}
                {
                  job.records.filter(
                    (record) =>
                      !['created', 'pending', 'processing'].includes(
                        record.status
                      )
                  ).length
                }
                .
              </p>
              <p className="mt-1">
                Всего списано: {rub(job.actualCostRub)}.{' '}
                {job.refundPending
                  ? 'Возврат резерва ожидает завершения.'
                  : 'Неиспользованный резерв возвращён.'}
              </p>
              <p className="mt-1">
                Откройте созданные {terms.plural} и отметьте «Импорт из файла
                проверен» после проверки.
              </p>
              <button
                type="button"
                className={`${button} mt-3`}
                onClick={() => {
                  setSelectedIds(
                    job.records
                      .filter(
                        (record) =>
                          !['created', 'duplicate'].includes(record.status)
                      )
                      .map((record) => record.id)
                  )
                  setEditRules(true)
                }}
              >
                Уточнить и продолжить оставшиеся записи
              </button>
            </Notice>
          ) : null}
        </>
      )}
    </section>
  )
}

export default FileImportSettings
