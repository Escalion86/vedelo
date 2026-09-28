const FIELD_CONFIG = Object.freeze({
  event: {
    clientId: 'Клиент', eventDate: 'Дата и время начала', dateEnd: 'Дата и время завершения', address: 'Адрес',
    status: 'Статус', cancelReason: 'Причина отмены', servicesIds: 'Услуги', contractSum: 'Договорная сумма',
    waitDeposit: 'Ожидание задатка', depositDueAt: 'Срок задатка', depositExpectedAmount: 'Сумма задатка',
    description: 'Комментарий', eventType: 'Тип события', additionalEvents: 'Задачи',
    financeComment: 'Комментарий по финансам', isTransferred: 'Передано коллеге', colleagueId: 'Коллега',
    otherContacts: 'Дополнительные контакты', isByContract: 'Работа по договору',
  },
  client: {
    firstName: 'Имя', secondName: 'Фамилия', thirdName: 'Отчество', phone: 'Телефон', whatsapp: 'WhatsApp',
    telegram: 'Telegram', instagram: 'Instagram', vk: 'ВКонтакте', preferredContactChannel: 'Предпочтительный канал',
    preferredContactChannelOther: 'Другой канал', comment: 'Комментарий', significantDates: 'Значимые даты',
    clientType: 'Тип клиента', legalName: 'Юридическое наименование', inn: 'ИНН', kpp: 'КПП', ogrn: 'ОГРН',
    bankName: 'Банк', bik: 'БИК', checkingAccount: 'Расчётный счёт', correspondentAccount: 'Корреспондентский счёт',
    legalAddress: 'Юридический адрес',
  },
  transaction: {
    eventId: 'Мероприятие', clientId: 'Клиент', amount: 'Сумма', type: 'Тип', category: 'Категория',
    date: 'Дата', comment: 'Комментарий', paymentMethod: 'Способ оплаты',
  },
})

const isDateLike = (value) => value instanceof Date ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))

const PRIVATE_OR_TECHNICAL_KEY = /(?:password|token|secret|credential|apiKey|calendarEventId|googleCalendarEventId|syncVersion|calendarSyncError|calendarImportChecked|updatedAt|createdAt|__v)/i

const safeValue = (value, depth = 0) => {
  if (value === undefined || value === null || depth > 4) return null
  if (isDateLike(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
  }
  if (typeof value === 'string') return value.slice(0, 3000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value?.toHexString === 'function') return String(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1))
  if (typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => !key.startsWith('$') && !PRIVATE_OR_TECHNICAL_KEY.test(key)).slice(0, 50)
      .map(([key, item]) => [key, safeValue(item, depth + 1)])
  )
  return String(value).slice(0, 3000)
}

export const getHistoryEntityLabel = (entityType, item = {}) => {
  if (entityType === 'client') {
    const name = [item.firstName, item.secondName, item.thirdName].filter(Boolean).join(' ').trim()
    return name || (item.phone ? `Клиент ${item.phone}` : 'Клиент')
  }
  if (entityType === 'transaction') {
    return `${item.type === 'income' ? 'Доход' : 'Расход'} ${Number(item.amount || 0).toLocaleString('ru-RU')} ₽`
  }
  const title = String(item.eventType || '').trim()
  const prefix = item.status === 'draft' ? 'Заявка' : 'Мероприятие'
  return title ? `${prefix}: ${title}` : prefix
}

export const buildHistoryChanges = ({ entityType, before, after, operation }) => {
  const result = []
  for (const [field, label] of Object.entries(FIELD_CONFIG[entityType] || {})) {
    const oldValue = before?.[field]
    const newValue = after?.[field]
    if (operation === 'update' && JSON.stringify(safeValue(oldValue)) === JSON.stringify(safeValue(newValue))) continue
    if (operation === 'create' && (newValue === undefined || newValue === null || newValue === '')) continue
    if (operation === 'delete' && oldValue === undefined) continue
    result.push({ field, label, oldValue: operation === 'create' ? null : safeValue(oldValue), newValue: operation === 'delete' ? null : safeValue(newValue) })
  }
  return result
}

export const getTaskSemanticAction = (changes, operation = 'update') => {
  if (operation !== 'update') return ''
  const taskChange = changes.find((item) => item.field === 'additionalEvents')
  if (!taskChange) return ''
  const before = Array.isArray(taskChange.oldValue) ? taskChange.oldValue : []
  const after = Array.isArray(taskChange.newValue) ? taskChange.newValue : []
  if (JSON.stringify(before) === JSON.stringify(after)) return ''
  if (after.length > before.length) return 'task_created'
  if (after.length < before.length) return 'task_deleted'
  if (after.some((item, index) => item?.done && !before[index]?.done)) return 'task_completed'
  if (after.some((item, index) => String(item?.date || '') !== String(before[index]?.date || ''))) return 'task_rescheduled'
  return 'task_updated'
}
