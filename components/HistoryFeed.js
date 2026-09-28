'use client'

import { Fragment, memo, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faClockRotateLeft,
  faExternalLinkAlt,
} from '@fortawesome/free-solid-svg-icons'
import AppButton from '@components/AppButton'
import EmptyState from '@components/EmptyState'
import LoadingSpinner from '@components/LoadingSpinner'
import Notice from '@components/Notice'
import { useHistoriesQuery } from '@helpers/useHistoriesQuery'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const SOURCE_LABELS = {
  web: 'Web', android: 'Android', public_api: 'Public API', tilda: 'Tilda',
  google_import: 'Google Calendar', avito: 'Avito', vk: 'VK', telephony: 'Телефония',
  file_import: 'Импорт из файла',
}
const SEMANTIC_LABELS = {
  task_created: 'Добавлена задача', task_deleted: 'Удалена задача',
  task_completed: 'Выполнена задача', task_rescheduled: 'Перенесена задача',
  task_updated: 'Изменена задача',
}
const STATUS_LABELS = { draft: 'Заявка', active: 'Подтверждено', canceled: 'Отменено', closed: 'Закрыто' }

const formatDateTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const formatDay = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Без даты'
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Сегодня'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
const dayKey = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

const formatValue = (field, value) => {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (field === 'status') return STATUS_LABELS[value] || String(value)
  if (field === 'amount' || field === 'contractSum' || field === 'depositExpectedAmount')
    return `${Number(value).toLocaleString('ru-RU')} ₽`
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)
  if (Array.isArray(value)) {
    if (field === 'additionalEvents') return value.map((item) => item?.title || 'Задача').join(', ') || 'Нет задач'
    return value.map((item) => typeof item === 'object' ? item?.title || item?.name || 'Запись' : String(item)).join(', ') || 'Пусто'
  }
  if (typeof value === 'object') {
    if (field === 'address')
      return [value.town, value.street, value.house, value.comment].filter(Boolean).join(', ') || 'Не указан'
    return Object.values(value).filter((item) => typeof item !== 'object' && item !== '').join(', ') || 'Изменено'
  }
  return String(value)
}

const HistoryRow = memo(({ item, onOpenItem }) => {
  const [open, setOpen] = useState(false)
  const terms = useWorkItemTerminology()
  const isCreation = item.operation === 'create'
  const actionLabel = isCreation
    ? item.entityType === 'event'
      ? `${terms.mode === 'orders' ? 'Создан' : 'Создано'} ${terms.label}`
      : item.summary
    : (item.operation === 'update' && SEMANTIC_LABELS[item.semanticAction]) || item.summary
  const entityLabel = item.entityType === 'event'
    ? item.entityLabel?.replace(/^Мероприятие(?=:|$)/, terms.labelCapitalized)
    : item.entityLabel
  return (
    <article className="history-row rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <button type="button" className="flex w-full cursor-pointer items-start gap-3 text-left" onClick={() => setOpen((value) => !value)}>
        <span className="bg-general/10 text-general mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="card-title block text-sm">{actionLabel || 'Изменение'}</span>
          <span className="card-meta mt-0.5 block truncate text-xs">{entityLabel}</span>
          <span className="card-muted mt-1 block text-xs">
            {formatDateTime(item.occurredAt)} · {item.actorLabel || 'Пользователь'} · {SOURCE_LABELS[item.source] || item.source || 'Web'}
          </span>
        </span>
        <FontAwesomeIcon icon={faChevronDown} className={`mt-2 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="mt-3 border-t border-gray-200 pt-2">
          {item.changes?.length ? item.changes.map((change) => (
            <div key={change.field} className={`grid gap-1 border-b border-gray-100 py-2 text-sm ${isCreation ? 'tablet:grid-cols-[minmax(120px,0.7fr)_2fr]' : 'tablet:grid-cols-[minmax(120px,0.7fr)_1fr_auto_1fr]'}`}>
              <span className="font-medium">{change.label}</span>
              {!isCreation ? <>
                <span className="break-words text-gray-500">{formatValue(change.field, change.oldValue)}</span>
                <span className="hidden text-gray-400 tablet:inline">→</span>
              </> : null}
              <span className="break-words">{formatValue(change.field, change.newValue)}</span>
            </div>
          )) : <div className="card-muted py-2 text-sm">Подробные изменения отсутствуют</div>}
          {onOpenItem && item.entityExists ? (
            <button type="button" className="text-general mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold" onClick={() => onOpenItem(item)}>
              Открыть карточку <FontAwesomeIcon icon={faExternalLinkAlt} className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
})
HistoryRow.displayName = 'HistoryRow'

const HistoryFeed = ({ filters, onOpenItem, compact = false }) => {
  const query = useHistoriesQuery(filters)
  const items = useMemo(
    () => query.data?.pages?.flatMap((page) => page?.data || []) || [],
    [query.data?.pages]
  )
  if (query.isPending) return <LoadingSpinner />
  if (query.isError) return <Notice tone="error">Не удалось загрузить историю действий</Notice>
  if (items.length === 0) return <EmptyState text="История действий пока пуста" bordered={false} />
  return (
    <div className={`flex flex-col gap-2 ${compact ? '' : 'pb-4'}`}>
      {items.map((item, index) => {
        const showDay = index === 0 || dayKey(items[index - 1]?.occurredAt) !== dayKey(item.occurredAt)
        const showBatch = item.batchId && items[index - 1]?.batchId !== item.batchId
        return <Fragment key={item.id}>
          {showDay ? <h3 className="card-muted mt-2 text-xs font-bold tracking-wide uppercase first:mt-0">{formatDay(item.occurredAt)}</h3> : null}
          {showBatch ? <div className="text-general text-xs font-semibold">Пакетный импорт</div> : null}
          <HistoryRow item={item} onOpenItem={onOpenItem} />
        </Fragment>
      })}
      {query.hasNextPage ? (
        <AppButton variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
        </AppButton>
      ) : null}
      {items.some((item) => item.legacy) ? <Notice tone="info">История до обновления могла сохраниться не полностью.</Notice> : null}
    </div>
  )
}

export default HistoryFeed
