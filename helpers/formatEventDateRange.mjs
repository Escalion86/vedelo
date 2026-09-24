export const formatEventDateRange = (startValue, endValue, currentYear = new Date().getFullYear()) => {
  if (!startValue) return 'Пока неизвестны'
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) return 'Пока неизвестны'

  const time = (date) => date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const full = (date) => {
    const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const year = date.getFullYear() === currentYear ? '' : ` ${date.getFullYear()}`
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase()
    return `${day}${year} ${weekday} ${time(date)}`
  }

  if (!endValue) return full(start)
  const end = new Date(endValue)
  if (Number.isNaN(end.getTime())) return full(start)
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate()
  return `${full(start)} - ${sameDay ? time(end) : full(end)}`
}
