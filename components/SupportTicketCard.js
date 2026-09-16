'use client'

import cn from 'classnames'
import StatusChip from '@components/StatusChip'

const CATEGORY_LABELS = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const STATUS_LABELS = {
  open: 'Открыт',
  in_progress: 'В работе',
  resolved: 'Решён',
}
const STATUS_PRESENTATION = {
  open: { tone: 'upcoming', dotClassName: 'support-ticket-status-dot--open' },
  in_progress: {
    tone: 'today',
    dotClassName: 'support-ticket-status-dot--in-progress',
  },
  resolved: {
    tone: 'tomorrow',
    dotClassName: 'support-ticket-status-dot--resolved',
  },
}

const formatDate = (value) =>
  value ? new Date(value).toLocaleString('ru-RU') : ''

const SupportTicketCard = ({ ticket, developer = false, onOpen }) => {
  const status = STATUS_PRESENTATION[ticket.status] || {
    tone: 'neutral',
    dotClassName: 'support-ticket-status-dot--neutral',
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className={cn(
        'support-ticket-card support-surface flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left',
        ticket.unread && 'support-ticket-card--unread'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'support-ticket-status-dot mt-1.5 h-2.5 w-2.5 flex-none rounded-full',
          status.dotClassName
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>{CATEGORY_LABELS[ticket.category]}</span>
          <StatusChip tone={status.tone}>
            {STATUS_LABELS[ticket.status]}
          </StatusChip>
          {ticket.unread ? (
            <span className="support-ticket-unread-label">
              {developer ? 'Новое сообщение' : 'Новый ответ'}
            </span>
          ) : null}
          {developer && ticket.createdByLabel ? (
            <span className="break-words">{ticket.createdByLabel}</span>
          ) : null}
        </div>
        <h2
          className={cn(
            'mt-1 break-words',
            ticket.unread ? 'font-bold' : 'font-semibold'
          )}
        >
          {ticket.title}
        </h2>
        <time className="mt-1 block text-xs text-gray-500">
          {formatDate(ticket.lastMessageAt)}
        </time>
      </div>
      <span
        aria-hidden="true"
        className="support-ticket-card__arrow flex-none text-lg text-gray-500"
      >
        →
      </span>
    </button>
  )
}

export default SupportTicketCard
