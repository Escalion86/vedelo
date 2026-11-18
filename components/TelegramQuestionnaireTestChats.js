import { useEffect, useState } from 'react'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import Notice from '@components/Notice'

export const telegramQuestionnaireTestEndpoint = '/api/integrations/telegram/questionnaire/test'
const limit = 12
const emptyList = []
const statuses = {
  waiting: 'Ждём сообщение «Начать тест»',
  inProgress: 'Тест идёт',
  completed: 'Завершён',
  limited: 'Черновик не создан по условиям тарифа',
  paused: 'Тест на паузе',
  cancelled: 'Отменён',
  handedOff: 'Передан владельцу',
}

const displayName = (chat) => chat?.name || (chat?.username ? `@${chat.username}` : 'Telegram-диалог')

export function useTelegramQuestionnaireTestData(active, search) {
  const [state, setState] = useState(null)
  const [knownChats, setKnownChats] = useState({})
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey((key) => key + 1)

  useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    const find = async () => {
      const errorMessage = 'Не удалось загрузить тестовые чаты и каталог услуг.'
      try {
        const response = await fetch(`${telegramQuestionnaireTestEndpoint}?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const json = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(json?.chats)) throw new Error(json?.error?.message || errorMessage)
        if (controller.signal.aborted) return
        setState({ ...json, search, refreshKey })
        setKnownChats((current) => ({ ...current, ...Object.fromEntries(json.chats.map((chat) => [chat.id, chat])) }))
        setError('')
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message || errorMessage)
      }
    }
    const timer = setTimeout(find, search ? 250 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, refreshKey, search])

  return {
    chats: state?.search === search ? state.chats : emptyList,
    runs: state?.runs ?? emptyList,
    services: state?.services ?? emptyList,
    knownChats,
    error,
    loading: active && !error && (state?.search !== search || state?.refreshKey !== refreshKey),
    refresh,
  }
}

function TestResult({ result }) {
  const values = [
    { label: 'Тип заказа', value: result.eventType },
    { label: 'Дата', value: result.date },
    { label: 'Время', value: result.time },
    { label: 'Город', value: result.city },
    { label: 'Площадка', value: result.venue },
    { label: 'Услуги', value: result.services?.join(', ') },
    { label: 'Комментарий', value: result.description },
  ].filter(({ value }) => value)

  return (
    <div className="min-w-0 rounded border border-gray-200 p-2 text-sm">
      {values.length ? (
        <dl className="space-y-2">
          {values.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-gray-600">{label}</dt>
              <dd className="break-words whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p>В тесте нет заполненных полей заявки.</p>}
      {result.draftId ? (
        <a
          className="mt-2 inline-flex min-h-10 items-center font-medium text-general underline focus-visible:outline-2 focus-visible:outline-offset-2"
          href={`/cabinet/eventsUpcoming?openEvent=${encodeURIComponent(result.draftId)}`}
        >
          Открыть тестовую заявку
        </a>
      ) : null}
    </div>
  )
}

export function TelegramQuestionnaireTestChats({
  selectedIds, data, search, onSearch, onSelect, onStart, busy, canStart,
}) {
  const { chats, knownChats, runs, loading, error, refresh } = data
  const [createDraft, setCreateDraft] = useState(false)
  const [resultChat, setResultChat] = useState(null)

  const toggleChat = (id, checked) => {
    if (checked && selectedIds.length >= limit) return
    onSelect(checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id))
  }

  return (
    <section aria-label="Тестовые чаты" className="flex min-w-0 flex-col gap-3 rounded border border-gray-200 p-3">
      <div>
        <p className="text-sm font-semibold">Тестовые чаты</p>
        <p className="text-xs leading-5 text-gray-600">Выберите до {limit} личных чатов, к которым у бота есть доступ. После запуска тестер пишет в своём чате «Начать тест».</p>
      </div>
      <Input label="Поиск по имени или телефону" ariaLabel="Поиск по имени или телефону" value={search} onChange={onSearch} maxLength={80} noMargin fullWidth />
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {loading ? <p className="text-sm" role="status">Загружаем чаты…</p> : null}
      {!loading && !error && !chats.length ? <p className="text-xs text-gray-600">Чаты не найдены. Проверьте запрос и доступ в Telegram Business.</p> : null}
      {chats.length ? (
        <ul className="max-h-52 divide-y divide-gray-200 overflow-y-auto rounded border border-gray-200 px-2" aria-label="Доступные чаты">
          {chats.map((chat) => {
            const selected = selectedIds.includes(chat.id)
            return (
              <li key={chat.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 py-1 has-[:disabled]:cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy || (!selected && selectedIds.length >= limit)}
                    onChange={(event) => toggleChat(chat.id, event.target.checked)}
                    className="h-5 w-5 shrink-0 accent-general focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm break-words">{displayName(chat)}</span>
                    <span className="block text-xs break-words text-gray-600">{[chat.username && `@${chat.username}`, chat.phone].filter(Boolean).join(' · ')}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : null}
      {selectedIds.length ? (
        <>
          {!canStart ? <Notice tone="info">Сохраните сценарий и список чатов, чтобы запустить тест.</Notice> : null}
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-general focus-visible:outline-2 focus-visible:outline-offset-2"
              checked={createDraft}
              disabled={busy}
              onChange={(event) => setCreateDraft(event.target.checked)}
            />
            Сохранить черновик в CRM по итогам теста
          </label>
          {createDraft ? <p className="text-xs text-gray-600">После подтверждения в Telegram в CRM появится тестовая заявка и придёт уведомление.</p> : null}
          <ul className="flex min-w-0 flex-col gap-2" aria-label="Выбранные тестовые чаты">
            {selectedIds.map((chatId) => {
              const chat = knownChats[chatId]
              const name = displayName(chat)
              const run = runs.find((current) => current.chatId === chatId)
              return (
                <li key={chatId} className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-2">
                  <div className="min-w-0 text-sm break-words">
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-gray-600" role="status">{run ? statuses[run.status] || 'Статус уточняется' : 'Тест не запущен'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AppButton
                      variant="secondary"
                      size="sm"
                      disabled={busy || !canStart}
                      aria-label={`${run ? 'Перезапустить' : 'Запустить'} тест — ${name}`}
                      onClick={() => onStart(chatId, createDraft)}
                    >
                      {run ? 'Перезапустить тест' : 'Запустить тест'}
                    </AppButton>
                    {run?.result ? (
                      <AppButton size="sm" variant="ghost" aria-expanded={resultChat === chatId} onClick={() => setResultChat(resultChat === chatId ? null : chatId)}>
                        {resultChat === chatId ? 'Скрыть результат' : 'Результат'}
                      </AppButton>
                    ) : null}
                    <AppButton size="sm" variant="ghost" disabled={busy} aria-label={`Убрать чат — ${name}`} onClick={() => toggleChat(chatId, false)}>
                      Убрать чат
                    </AppButton>
                  </div>
                  {run?.result && resultChat === chatId ? <TestResult result={run.result} /> : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      {runs.length || error ? <AppButton className="self-start" size="sm" variant="ghost" disabled={loading} onClick={refresh}>Обновить результаты</AppButton> : null}
    </section>
  )
}
