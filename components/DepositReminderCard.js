import { useRef, useState } from 'react'
import SurfaceCard from '@components/SurfaceCard'
import QuickActionButtons from '@components/QuickActionButtons'
import Notice from '@components/Notice'
import formatDateTime from '@helpers/formatDateTime'
import {
  getEventAddressLine,
  getPostponeActionsForSegment,
} from '@helpers/upcomingEventsOverview'

const DepositReminderCard = ({
  event,
  segment,
  onOpen,
  onReceive,
  onPostpone,
}) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const address = getEventAddressLine(event)
  const postpone = async (offset) => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await onPostpone(offset)
    } catch {
      setError('Не удалось перенести ожидание задатка')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <SurfaceCard className="additional-event-list-card border-gray-200">
      <button
        type="button"
        className="w-full cursor-pointer rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onOpen}
      >
        <div className="card-title text-sm font-semibold">
          {segment === 'overdue' ? 'Просрочен задаток' : 'Жду задаток'}
        </div>
        <div className="card-muted text-xs">
          {formatDateTime(event.depositDueAt, true, false, true, false)}
        </div>
        <div className="card-muted mt-1 text-xs">
          {event.eventType}
          {event.eventDate
            ? ` • начало ${formatDateTime(event.eventDate, true, false, true, false)}`
            : ''}
        </div>
        {address ? <div className="card-muted text-xs">{address}</div> : null}
        {Number(event.depositExpectedAmount) > 0 ? (
          <div className="card-muted text-xs">
            Ожидается:{' '}
            {Number(event.depositExpectedAmount).toLocaleString('ru-RU')} ₽
          </div>
        ) : null}
      </button>
      <QuickActionButtons
        wrapperClassName="mt-2"
        actions={[
          {
            key: 'receive',
            label: 'Задаток получен',
            variant: 'primary',
            className: 'min-h-10 w-full tablet:w-auto',
            onClick: onReceive,
            disabled: saving,
          },
          ...getPostponeActionsForSegment(segment).map((action) => ({
            ...action,
            variant: 'secondary',
            className: 'min-h-10 w-full tablet:w-auto',
            disabled: saving,
            onClick: () => postpone(action.targetDayOffset),
          })),
        ]}
      />
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
    </SurfaceCard>
  )
}

export default DepositReminderCard
