const DAY_MS = 24 * 60 * 60 * 1000

export const getEventTitle = (event, fallback = 'Мероприятие') => {
  const title = String(event?.eventType || event?.title || '').trim()
  return title || fallback
}

export const getEventAddressLine = (event) => {
  const address = event?.address
  if (!address || typeof address !== 'object') return ''
  return [
    address.town,
    address.street,
    address.house,
    address.flat ? `кв. ${address.flat}` : '',
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
}

export const getPendingAttentionCount = (items) =>
  (Array.isArray(items) ? items : []).filter(
    (item) => item?.reminderType !== 'additional_done'
  ).length

export const getPostponeActionsForSegment = (segment) => {
  if (segment === 'tomorrow') {
    return [
      {
        key: 'day-after-tomorrow',
        label: 'Перенести на послезавтра',
        targetDayOffset: 2,
      },
      {
        key: 'plus-2-days',
        label: 'Перенести на +2 дня',
        targetDayOffset: 3,
      },
    ]
  }

  return [
    {
      key: 'tomorrow',
      label: 'Перенести на завтра',
      targetDayOffset: 1,
    },
    {
      key: 'day-after-tomorrow',
      label: 'Перенести на послезавтра',
      targetDayOffset: 2,
    },
  ]
}

export const moveDateToDayOffset = (
  sourceDateValue,
  dayOffset,
  now = new Date()
) => {
  const sourceDate = sourceDateValue ? new Date(sourceDateValue) : null
  const safeSource =
    sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate : now
  const target = new Date(now)
  target.setHours(
    safeSource.getHours(),
    safeSource.getMinutes(),
    safeSource.getSeconds(),
    safeSource.getMilliseconds()
  )
  target.setTime(
    target.getTime() + Math.max(0, Number(dayOffset || 0)) * DAY_MS
  )
  return target
}
