'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import AppButton from './AppButton'
import ComboBox from './ComboBox'
import Notice from './Notice'

const errorsText = {
  deleted_in_google: 'Запись удалена в Google. Задача Ведело сохранена.',
  tasks_permission_required: 'Нужно разрешить доступ к Google Tasks.',
  select_task_list: 'Выберите список задач.',
  unknown_create: 'Ответ о создании потерян. Повторная проверка ищет уже созданную задачу и не создаёт дубль.',
  ambiguous_create: 'В Google найдено несколько копий. Нужна ручная сверка.',
  local_conflict: 'Задача изменилась во время проверки. Повторите синхронизацию.',
  google_sync_failed: 'Не удалось синхронизировать запись. Повторите проверку.',
}
const modes = [{ value: 'event', name: 'Событие в календаре' }, { value: 'task', name: 'Задача Google Tasks' }]

export default function GoogleTasksBetaSettings({ redirectPath = '/cabinet/integrations' }) {
  const client = useQueryClient()
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('event')
  const [list, setList] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/google-calendar/tasks-beta')
    const result = await response.json()
    if (!result.success) throw new Error(result.error)
    setData(result.data)
    setMode(result.data.defaultMode)
    setList(result.data.taskListId)
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => load().catch((err) => setError(err.message)), 0)
    return () => clearTimeout(timer)
  }, [load])
  const run = async (action, extra = {}) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      if (action === 'connect') {
        const response = await fetch(`/api/google-calendar/auth-url?tasks=1&redirect=${encodeURIComponent(redirectPath)}`)
        const result = await response.json()
        if (!result.success || !result.data?.url) throw new Error(result.error || 'Не удалось подключить Google Tasks')
        window.location.assign(result.data.url)
        return
      }
      const response = await fetch('/api/google-calendar/tasks-beta', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, defaultMode: mode, taskListId: list, ...extra }) })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)
      await load()
      await Promise.all([client.invalidateQueries({ queryKey: ['events'] }), client.invalidateQueries({ queryKey: ['event'] }), client.invalidateQueries({ queryKey: ['google-tasks-beta-status'] })])
      setMessage(action === 'settings' ? 'Настройки сохранены. Новые задачи используют выбранный способ.' : 'Проверена очередная партия записей. Незавершённые операции показаны ниже.')
    } catch (err) { setError(err.message || 'Не удалось выполнить действие') }
    finally { setBusy(false) }
  }
  return <section className="mt-4 flex min-w-0 flex-col gap-3">
    <div className="font-semibold">Google Tasks · тест для разработчика</div>
    <Notice tone="info">В Google Tasks передаётся только дата. Точное время и напоминания остаются в Ведело. Отметки выполнения проверяются раз в минуту при открытом кабинете и по кнопке ниже.</Notice>
    {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
    {message ? <Notice tone="success" role="status">{message}</Notice> : null}
    {!data ? <span role="status">Загрузка настроек…</span> : !data.authorized ?
      <AppButton variant="secondary" disabled={busy} onClick={() => run('connect')}>Разрешить Google Tasks</AppButton> : <>
        <ComboBox label="Новые задачи/события отправлять как" items={modes} value={mode} onChange={setMode} disabled={busy} noMargin fullWidth />
        <ComboBox label="Список Google Tasks" items={data.lists.map((item) => ({ value: item.id, name: item.title }))} value={list} onChange={setList} disabled={busy} placeholder="Выберите список" noMargin fullWidth />
        {!data.lists.length ? <Notice tone="info">Создайте список «Ведело» в Google Tasks и обновите эту страницу.</Notice> : null}
        <div className="flex flex-wrap gap-2">
          <AppButton disabled={busy || !list} onClick={() => run('settings')}>{data.enabled ? 'Сохранить настройки задач' : 'Включить тестовую функцию'}</AppButton>
          {data.enabled ? <AppButton variant="secondary" disabled={busy} onClick={() => run('sync')}>Синхронизировать задачи</AppButton> : null}
        </div>
      </>}
    {data?.errors?.map((item) => <Notice key={item._id} tone="warning">
      {errorsText[item.error] || errorsText.google_sync_failed}
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="underline" href={`/cabinet/eventsUpcoming?openEvent=${item.eventId}`}>Открыть заказ</a>
        {item.error === 'deleted_in_google' ? <AppButton size="sm" variant="secondary" disabled={busy} onClick={() => run('restore', { id: item._id })}>Восстановить в Google</AppButton> : null}
      </div>
    </Notice>)}
  </section>
}
