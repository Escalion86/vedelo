import getNoun from './getNoun.js'

// Дата меняет раздел списка, но не бизнес-статус заявки.
export const isPastRequest = (event, now = new Date()) => {
  if (event?.status !== 'draft') return false
  const value = event.dateEnd ?? event.eventDate
  if (!value) return false
  const end = new Date(value).getTime()
  return Number.isFinite(end) && end < now.getTime()
}

export const getPastRequests = (events, now = new Date()) =>
  (Array.isArray(events) ? events : [])
    .filter((event) => isPastRequest(event, now))
    .sort(
      (a, b) =>
        new Date(a.dateEnd ?? a.eventDate) - new Date(b.dateEnd ?? b.eventDate)
    )

export const getPastRequestAge = (event, now = new Date()) => {
  const days = Math.floor(
    (now.getTime() - new Date(event.dateEnd ?? event.eventDate).getTime()) /
      86_400_000
  )
  return days < 1
    ? 'Менее суток назад'
    : `${getNoun(days, 'день', 'дня', 'дней')} назад`
}
