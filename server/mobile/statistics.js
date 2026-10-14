const asId = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  return typeof value.toString === 'function' ? value.toString() : null
}

const asDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const serializeEvent = (event = {}) => ({
  _id: asId(event._id),
  clientId: asId(event.clientId),
  eventType: String(event.eventType || ''),
  description: String(event.description || ''),
  eventDate: asDate(event.eventDate),
  dateEnd: asDate(event.dateEnd),
  status: String(event.status || 'active'),
  isTransferred: event.isTransferred === true,
  contractSum: Number(event.contractSum || 0),
  address: {
    town: String(event.address?.town || ''),
    street: String(event.address?.street || ''),
    house: String(event.address?.house || ''),
  },
})

const serializeClient = (client = {}) => ({
  _id: asId(client._id),
  firstName: String(client.firstName || ''),
  secondName: String(client.secondName || ''),
})

const serializeTransaction = (transaction = {}) => ({
  _id: asId(transaction._id),
  eventId: asId(transaction.eventId),
  clientId: asId(transaction.clientId),
  amount: Number(transaction.amount || 0),
  type: transaction.type === 'expense' ? 'expense' : 'income',
  category: String(transaction.category || ''),
  date: asDate(transaction.date),
  comment: String(transaction.comment || ''),
})

export const sanitizeMobileStatisticsPayload = (payload = {}) => {
  if (!payload?.data) return payload
  return {
    ...payload,
    data: {
      events: Array.isArray(payload.data.events)
        ? payload.data.events.map(serializeEvent)
        : [],
      clients: Array.isArray(payload.data.clients)
        ? payload.data.clients.map(serializeClient)
        : [],
      transactions: Array.isArray(payload.data.transactions)
        ? payload.data.transactions.map(serializeTransaction)
        : [],
      filters: payload.data.filters || {},
    },
  }
}
