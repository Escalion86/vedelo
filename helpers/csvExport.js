import formatAddress from '@helpers/formatAddress'
import getPersonFullName from '@helpers/getPersonFullName'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const EVENT_STATUS_LABELS = Object.freeze({
  draft: 'Заявка',
  active: 'Активно',
  canceled: 'Отменено',
  finished: 'Завершено',
  closed: 'Закрыто',
})

const isValidDate = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const getEventComputedStatus = (event) => {
  if (!event) return 'active'
  if (event.status === 'draft') return 'draft'
  if (event.status === 'canceled') return 'canceled'
  if (event.status === 'closed') return 'closed'
  const dateRaw = event.dateEnd ?? event.eventDate
  if (!isValidDate(dateRaw)) return event.status || 'active'
  return new Date(dateRaw).getTime() < Date.now() ? 'finished' : 'active'
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const buildCsv = (headers, rows, delimiter = ';') => {
  const escapeValue = (value) => {
    if (value === null || value === undefined) return ''
    const text = String(value).replace(/\r?\n/g, ' ')
    if (text.includes('"') || text.includes(delimiter)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }
  const headerLine = headers.map(escapeValue).join(delimiter)
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeValue(row[header])).join(delimiter)
  )
  return [headerLine, ...dataLines].join('\r\n')
}

export const downloadCsv = (fileName, headers, rows) => {
  const csv = buildCsv(headers, rows)
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const buildExportDatasets = ({
  events = [],
  clients = [],
  services = [],
  transactions = [],
  siteSettings = {},
}) => {
  const terms = resolveWorkItemTerminology(siteSettings)
  const eventDateHeader = `Дата ${terms.genitive}`
  const linkedHeader = `Связано с ${terms.instrumental}`
  const transactionEventHeader = terms.labelCapitalized
  const eventsMap = new Map(
    events.filter((item) => item?._id).map((item) => [item._id, item])
  )
  const clientsMap = new Map(
    clients.filter((item) => item?._id).map((item) => [item._id, item])
  )
  const servicesMap = new Map(
    services.filter((item) => item?._id).map((item) => [item._id, item])
  )
  const financeMap = new Map()

  transactions.forEach((transaction) => {
    if (!transaction?.eventId) return
    const finance = financeMap.get(transaction.eventId) || {
      income: 0,
      expense: 0,
    }
    const amount = Number(transaction.amount ?? 0)
    if (transaction.type === 'income') finance.income += amount
    if (transaction.type === 'expense') finance.expense += amount
    financeMap.set(transaction.eventId, finance)
  })

  const resolveServicesTitles = (ids = []) =>
    Array.isArray(ids)
      ? ids
          .map((id) => servicesMap.get(id)?.title ?? id)
          .filter(Boolean)
          .join(', ')
      : ''
  const resolveClientName = (clientId, fallbackName) => {
    if (!clientId) return fallbackName || ''
    const client = clientsMap.get(clientId)
    return client
      ? getPersonFullName(client, { fallback: String(clientId) })
      : fallbackName || String(clientId)
  }
  const resolveClientPhone = (clientId, fallbackPhone) => {
    if (fallbackPhone) return fallbackPhone
    const client = clientId ? clientsMap.get(clientId) : null
    return client?.phone ? `+${client.phone}` : ''
  }
  const resolveEventTitle = (event) =>
    event
      ? [
          resolveServicesTitles(event.servicesIds),
          formatAddress(event.address, ''),
        ]
          .filter(Boolean)
          .join(' • ')
      : ''

  const eventsHeaders = [
    'ID',
    'Дата начала',
    'Дата окончания',
    'Клиент',
    'Город',
    'Адрес',
    'Услуги',
    'Статус',
    'Договорная сумма',
    'Доход',
    'Расход',
    'Прибыль',
  ]
  const eventsRows = events
    .filter((event) => event?.status !== 'draft')
    .map((event) => {
      const finance = financeMap.get(event._id) || { income: 0, expense: 0 }
      return {
        ID: event._id,
        'Дата начала': formatDateTime(event.eventDate),
        'Дата окончания': formatDateTime(event.dateEnd),
        Клиент: resolveClientName(event.clientId),
        Город: event?.address?.town ?? '',
        Адрес: formatAddress(event.address, ''),
        Услуги: resolveServicesTitles(event.servicesIds),
        Статус:
          EVENT_STATUS_LABELS[getEventComputedStatus(event)] ||
          event.status ||
          '',
        'Договорная сумма': Number(event.contractSum ?? 0),
        Доход: finance.income,
        Расход: finance.expense,
        Прибыль: finance.income - finance.expense,
      }
    })

  const requestsHeaders = [
    'ID',
    'Дата заявки',
    eventDateHeader,
    'Клиент',
    'Телефон',
    'Город',
    'Адрес',
    'Услуги',
    'Статус',
    'Договорная сумма',
    linkedHeader,
  ]
  const requestsRows = events
    .filter((event) => event?.status === 'draft')
    .map((request) => ({
      ID: request._id,
      'Дата заявки': formatDateTime(request.createdAt),
      [eventDateHeader]: formatDateTime(request.eventDate),
      Клиент: resolveClientName(request.clientId),
      Телефон: resolveClientPhone(request.clientId, request.phone),
      Город: request?.address?.town ?? '',
      Адрес: formatAddress(request.address, ''),
      Услуги: resolveServicesTitles(request.servicesIds),
      Статус: request.status ?? '',
      'Договорная сумма': Number(request.contractSum ?? 0),
      [linkedHeader]: 'Нет',
    }))

  const transactionsHeaders = [
    'ID',
    'Дата',
    'Тип',
    'Категория',
    'Сумма',
    'Клиент',
    transactionEventHeader,
    'Комментарий',
  ]
  const transactionsRows = transactions.map((transaction) => ({
    ID: transaction._id,
    Дата: formatDateTime(transaction.date),
    Тип: transaction.type ?? '',
    Категория: transaction.category ?? '',
    Сумма: Number(transaction.amount ?? 0),
    Клиент: resolveClientName(transaction.clientId),
    [transactionEventHeader]: resolveEventTitle(eventsMap.get(transaction.eventId)),
    Комментарий: transaction.comment ?? '',
  }))

  return {
    events: { headers: eventsHeaders, rows: eventsRows },
    requests: { headers: requestsHeaders, rows: requestsRows },
    transactions: { headers: transactionsHeaders, rows: transactionsRows },
  }
}
