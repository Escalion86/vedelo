const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const formatDateLong = (value) => {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value ?? '').trim())
  if (!parts) return ''
  const [, dayText, monthText, yearText] = parts
  const day = Number(dayText),
    month = Number(monthText),
    year = Number(yearText)
  if (year < 1 || month < 1 || month > 12 || day < 1) return ''
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return ''
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}г.`
}

export const getProposalVariableValue = (variables, key) => {
  const value = key
    .split('.')
    .reduce((current, part) => current?.[part], variables)
  if (value !== undefined || key !== 'event.dateLong') return value
  // Два формата используют один сохранённый день, без сдвига часового пояса
  // и без записи нового поля в уже существующие снимки КП.
  return formatDateLong(variables?.event?.date)
}
