// This contract is shared by the preview and server. Unknown fields fail closed.
export const AI_EDIT_FIELDS = {
  event: {
    eventType: 'Тип', eventDate: 'Начало', dateEnd: 'Окончание',
    description: 'Описание', contractSum: 'Стоимость',
    waitDeposit: 'Ожидать задаток', depositExpectedAmount: 'Ожидаемый задаток',
    depositDueAt: 'Срок задатка', isByContract: 'По договору',
    financeComment: 'Финансовый комментарий', servicesIds: 'Услуги',
    address: 'Адрес', additionalEvents: 'Задачи',
  },
  client: {
    firstName: 'Имя', secondName: 'Фамилия', thirdName: 'Отчество',
    phone: 'Телефон', whatsapp: 'WhatsApp', viber: 'Viber',
    email: 'Email', telegram: 'Telegram', instagram: 'Instagram',
    vk: 'VK', comment: 'Комментарий',
  },
  transaction: {
    amount: 'Сумма', type: 'Доход / расход', category: 'Категория',
    date: 'Дата', comment: 'Комментарий', paymentMethod: 'Способ оплаты',
  },
}

export const AI_EDIT_LABELS = {
  income: 'Доход', expense: 'Расход', deposit: 'Задаток',
  final_payment: 'Остаток оплаты', referral_in: 'Комиссия полученная',
  referral_out: 'Комиссия выплаченная', other: 'Другое',
  transfer: 'Перевод', account: 'Расчётный счёт', cash: 'Наличные',
  barter: 'Бартер', obligation: 'Обязательство',
  tips: 'Чаевые', refund: 'Возврат клиенту', organizer: 'Организатору',
  travel: 'Дорога', taxes: 'Налоги',
}

export const editError = (message, status = 400) =>
  Object.assign(new Error(message), { status, safe: true })

const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const date = (value) => {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw editError('Уточните дату, время и часовой пояс')
  return new Date(value).toISOString()
}
const string = (value, max = 2000) => {
  if (typeof value !== 'string' || value.length > max) throw editError('Некорректное текстовое поле')
  return value.trim()
}
const bool = (value) => {
  if (typeof value !== 'boolean') throw editError('Некорректное логическое поле')
  return value
}
const money = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10)
    throw editError('Уточните сумму')
  return Math.round(value * 100) / 100
}
const oneOf = (value, allowed) => {
  if (!allowed.includes(value)) throw editError('Недопустимое значение поля')
  return value
}
const exactKeys = (value, allowed) => {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    throw editError('ИИ предложил неподдерживаемое изменение. Уточните запрос')
}

export function validateAiEditPatch(entity, input, serviceIds = []) {
  exactKeys(input, Object.keys(AI_EDIT_FIELDS[entity] || {}))
  const result = {}
  for (const [key, value] of Object.entries(input)) {
    if (['eventDate', 'dateEnd', 'depositDueAt', 'date'].includes(key)) {
      result[key] = value === null && key !== 'date' ? null : date(value)
    } else if (['waitDeposit', 'isByContract'].includes(key)) result[key] = bool(value)
    else if (['contractSum', 'depositExpectedAmount', 'amount'].includes(key)) result[key] = money(value)
    else if (['phone', 'whatsapp', 'viber'].includes(key)) {
      const digits = String(value ?? '').replace(/[^\d]/g, '')
      if (value && !digits) throw editError('Уточните номер телефона')
      if (digits && !/^\d{10,15}$/.test(digits)) throw editError('Уточните номер телефона')
      result[key] = digits ? Number(digits) : null
    } else if (key === 'type') result[key] = oneOf(value, ['income', 'expense'])
    else if (key === 'paymentMethod') result[key] = oneOf(value, ['transfer', 'account', 'cash', 'barter', 'obligation'])
    else if (key === 'category') result[key] = oneOf(value, ['deposit', 'final_payment', 'referral_in', 'referral_out', 'tips', 'refund', 'organizer', 'travel', 'taxes', 'expense', 'other'])
    else if (key === 'servicesIds') {
      if (!Array.isArray(value) || value.length > 100 || value.some((id) => !serviceIds.includes(id)))
        throw editError('Услуга не найдена в вашем каталоге')
      result[key] = [...new Set(value)]
    } else if (key === 'address') {
      exactKeys(value, ['town', 'street', 'house', 'entrance', 'floor', 'flat', 'comment'])
      result[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, string(v, 500)]))
    } else if (key === 'additionalEvents') {
      // Tasks use explicit add/update actions, never a model-authored replacement array.
      throw editError('Используйте отдельные действия для задач')
    } else result[key] = string(value, ['firstName', 'secondName', 'thirdName'].includes(key) ? 100 : 2000)
  }
  return result
}

export function buildAiEditSteps(proposal, snapshot, newId, now = new Date().toISOString()) {
  exactKeys(proposal, ['actions', 'question'])
  if (proposal.question) return { question: string(proposal.question, 1000), steps: [] }
  if (!Array.isArray(proposal.actions) || proposal.actions.length > 12)
    throw editError('Слишком много изменений. Разделите запрос')
  const { event, client, transactions, services } = snapshot
  if (!['draft', 'active'].includes(event.status)) throw editError('Для закрытой или отменённой записи используйте обычный редактор', 409)
  const steps = []
  let eventPatch = {}
  const targets = new Set()
  let tasks = null
  for (const action of proposal.actions) {
    exactKeys(action, ['entity', 'operation', 'id', 'patch'])
    const { entity, operation, id, patch } = action
    if (entity === 'task') {
      exactKeys(patch, ['title', 'description', 'date', 'done'])
      if (!['create', 'update'].includes(operation)) throw editError('Действие с задачей не поддерживается')
      const taskKey = `task:${id}`
      if (operation === 'update' && targets.has(taskKey)) throw editError('Задача указана несколько раз')
      targets.add(taskKey)
      tasks ??= structuredClone(event.additionalEvents || [])
      const index = operation === 'update' ? tasks.findIndex((task) => String(task._id) === id) : -1
      if (operation === 'update' && index < 0) throw editError('Задача не найдена', 404)
      const taskPatch = {}
      for (const [key, value] of Object.entries(patch)) taskPatch[key] =
        key === 'date' ? date(value) : key === 'done' ? bool(value) : string(value, 1000)
      if (Object.hasOwn(taskPatch, 'done')) taskPatch.doneAt = taskPatch.done ? now : null
      if (operation === 'create') {
        if (!taskPatch.title || !taskPatch.date) throw editError('Уточните название и дату задачи')
        tasks.push({ _id: newId(), done: false, doneAt: null, ...taskPatch })
      } else tasks[index] = { ...tasks[index], ...taskPatch }
      continue
    }
    if (!['event', 'client', 'transaction'].includes(entity)) throw editError('Объект не поддерживается')
    if (operation !== 'update' && !(entity === 'transaction' && operation === 'create'))
      throw editError('Действие не поддерживается')
    const before = entity === 'event' ? event : entity === 'client' ? client :
      operation === 'update' ? transactions.find((item) => String(item._id) === id) : null
    if (operation === 'update' && (!before || String(before._id) !== id)) throw editError('Связанная запись не найдена', 404)
    const target = `${entity}:${id}`
    if (operation === 'update' && targets.has(target)) throw editError('Запись указана несколько раз')
    targets.add(target)
    const normalized = validateAiEditPatch(entity, patch, services.map((service) => String(service._id)))
    if (entity === 'event') {
      eventPatch = normalized
      if (normalized.address) eventPatch.address = { ...event.address, ...normalized.address }
      continue
    }
    if (entity === 'transaction') {
      if (event.status === 'draft') throw editError('Транзакции недоступны для заявки. Сначала подтвердите её в обычной форме')
      if (operation === 'create' && ['amount', 'type', 'category', 'date', 'paymentMethod'].some((key) => normalized[key] === undefined))
        throw editError('Уточните сумму, направление, категорию, дату и способ оплаты')
      if (normalized.amount === 0) throw editError('Сумма транзакции должна быть больше нуля')
      const next = { ...before, ...normalized }
      if ((['deposit', 'final_payment', 'referral_in', 'tips'].includes(next.category) && next.type !== 'income') ||
        (['referral_out', 'refund', 'organizer', 'travel', 'taxes', 'expense'].includes(next.category) && next.type !== 'expense'))
        throw editError('Категория не соответствует доходу или расходу')
      if (operation === 'create' && transactions.some((item) =>
        item.amount === normalized.amount && item.type === normalized.type &&
        item.category === normalized.category && item.paymentMethod === normalized.paymentMethod &&
        String(item.date).slice(0, 10) === normalized.date.slice(0, 10)))
        throw editError('Найдена похожая оплата. Проверьте существующую транзакцию перед добавлением')
    }
    if (Object.keys(normalized).length) steps.push({ entity, operation, id: before?._id || newId(), before, patch: normalized })
  }
  if (tasks) eventPatch.additionalEvents = tasks
  if (Object.keys(eventPatch).length) {
    const next = { ...event, ...eventPatch }
    if (next.status === 'active' && !next.eventDate) throw editError('Для подтверждённой записи нужна дата')
    if (next.eventDate && next.dateEnd && Date.parse(next.eventDate) > Date.parse(next.dateEnd))
      throw editError('Начало не может быть позже окончания. Уточните обе даты')
    steps.push({ entity: 'event', operation: 'update', id: event._id, before: event, patch: eventPatch })
  }
  if (!steps.length) return { question: 'Что именно нужно изменить?', steps: [] }
  return { question: '', steps }
}
