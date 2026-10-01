import type { Event } from './types'

export type EventTaskDraft = NonNullable<Event['additionalEvents']>[number] & {
  localKey: string
  dateInput: string
}

export const formatEventDateInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? parseEventDateInput(value) || NaN : value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16).replace('T', ' ')
}

export const parseEventDateInput = (value: string) => {
  if (!value.trim()) return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/)
  if (!match) return undefined
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const hour = Number(match[4] || 0), minute = Number(match[5] || 0)
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) return undefined
  return date.toISOString()
}

export const validateEventDates = ({
  eventDate,
  dateEnd,
  depositDueAt,
  tasks,
}: {
  eventDate: string
  dateEnd: string
  depositDueAt: string
  tasks: EventTaskDraft[]
}) => {
  const parsedEventDate = parseEventDateInput(eventDate)
  const parsedDateEnd = parseEventDateInput(dateEnd)
  if (parsedEventDate === undefined || parsedDateEnd === undefined) {
    return 'Дата должна быть в формате ГГГГ-ММ-ДД или ГГГГ-ММ-ДД ЧЧ:ММ'
  }
  if (parsedEventDate && parsedDateEnd && parsedEventDate > parsedDateEnd) {
    return 'Дата окончания не может быть раньше даты начала'
  }
  if (parseEventDateInput(depositDueAt) === undefined) {
    return 'Срок задатка должен быть в формате ГГГГ-ММ-ДД ЧЧ:ММ'
  }
  if (tasks.some((task) => parseEventDateInput(task.dateInput) === undefined)) {
    return 'Срок контакта должен быть в формате ГГГГ-ММ-ДД ЧЧ:ММ'
  }
  if (tasks.some((task) => !task.title?.trim())) {
    return 'У каждого следующего контакта должно быть название'
  }
  return ''
}

export const serializeEventTasks = (tasks: EventTaskDraft[]) => tasks.map((task) => ({
  ...(task._id ? { _id: task._id } : {}),
  title: task.title?.trim() || '',
  description: task.description?.trim() || '',
  date: parseEventDateInput(task.dateInput) ?? null,
  done: Boolean(task.done),
  doneAt: task.doneAt || null,
}))

export const EVENT_SECTIONS = [
  ['general', 'Общие'], ['contacts', 'Клиент и контакты'], ['finance', 'Финансы и Документы'],
] as const
export type EventSection = typeof EVENT_SECTIONS[number][0]
export const eventSection = (value: unknown): EventSection =>
  value === 'contacts' || value === 'finance' ? value : 'general'
export const eventStatus = (value: unknown): Event['status'] =>
  value === 'active' || value === 'closed' || value === 'canceled' ? value : 'draft'

// Native text fields never display web markup. Keep the original HTML in source
// and send it unchanged if the user only edits another field.
export const eventPlainText = (value?: string) => (value || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, (entity) =>
    ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity] || entity)
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
    const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity
  }).trim()

export const emptyEventValues = {
  eventType: '', description: '', eventDate: '', dateEnd: '', status: 'draft' as Event['status'],
  clientId: '', town: '', street: '', house: '', entrance: '', floor: '', flat: '', addressComment: '',
  contractSum: '', waitDeposit: false, depositExpectedAmount: '', depositDueAt: '',
  isTransferred: false, colleagueId: '', calendarImportChecked: true, fileImportChecked: false,
  requestCreatedAt: '',
}
export type EventFormValues = typeof emptyEventValues
export type OtherContactDraft = { localKey: string; clientId: string; comment: string }
export type EventDraft = {
  values: EventFormValues
  serviceIds: string[]
  tasks: EventTaskDraft[]
  otherContacts: OtherContactDraft[]
  source?: Event
  cloning?: boolean
}
export const createEventDraft = (event?: Event, cloning = false): EventDraft => ({
  source: event,
  cloning,
  values: {
    ...emptyEventValues,
    eventType: event?.eventType || '', description: eventPlainText(event?.description),
    eventDate: formatEventDateInput(event?.eventDate), dateEnd: formatEventDateInput(event?.dateEnd),
    status: cloning ? 'draft' : eventStatus(event?.status), clientId: event?.clientId || '',
    town: event?.address?.town || '', street: event?.address?.street || '', house: event?.address?.house || '',
    entrance: event?.address?.entrance || '', floor: event?.address?.floor || '', flat: event?.address?.flat || '',
    addressComment: event?.address?.comment || '', contractSum: String(event?.contractSum ?? ''),
    waitDeposit: Boolean(event?.waitDeposit), depositExpectedAmount: String(event?.depositExpectedAmount ?? ''),
    depositDueAt: formatEventDateInput(event?.depositDueAt), isTransferred: Boolean(event?.isTransferred),
    colleagueId: event?.colleagueId || '', calendarImportChecked: cloning || !event ? true : Boolean(event.calendarImportChecked),
    fileImportChecked: Boolean(event?.fileImportChecked),
    requestCreatedAt: formatEventDateInput(cloning ? new Date().toISOString() : event?.requestCreatedAt || event?.createdAt || new Date().toISOString()),
  },
  serviceIds: event?.servicesIds || [],
  tasks: (event?.additionalEvents || []).map((task, index) => ({
    ...task, ...(cloning ? { _id: undefined, done: false, doneAt: null } : {}),
    localKey: `task-${index}`, dateInput: formatEventDateInput(task.date),
    description: eventPlainText(task.description),
  })),
  otherContacts: (event?.otherContacts || []).map((contact, index) => ({
    localKey: `contact-${index}`, clientId: contact.clientId || '', comment: contact.comment || '',
  })),
})

export const validateEventDraft = (draft: EventDraft) => {
  const { values, tasks, otherContacts } = draft
  if (!values.eventType.trim() && !values.description.trim()) return 'Укажите тип или описание'
  if (!['draft', 'active', 'closed', 'canceled'].includes(values.status)) return 'Выберите допустимый статус'
  const dates = validateEventDates({ ...values, depositDueAt: values.waitDeposit ? values.depositDueAt : '', tasks })
  if (dates) return dates
  if (parseEventDateInput(values.requestCreatedAt) === undefined) return 'Проверьте дату заявки'
  if ([values.contractSum, ...(values.waitDeposit ? [values.depositExpectedAmount] : [])]
    .some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'Суммы должны быть неотрицательными числами'
  if (values.isTransferred && !values.colleagueId) return 'Выберите коллегу для передачи'
  if (otherContacts.some((contact) => !contact.clientId)) return 'Выберите клиента для каждого дополнительного контакта'
  const ids = otherContacts.map((contact) => contact.clientId)
  if (ids.includes(values.clientId) || new Set(ids).size !== ids.length) return 'Основной и дополнительные контакты не должны повторяться'
  return ''
}

// Preserve seconds, milliseconds and the original offset for untouched values.
const serializeDate = (value: string, source?: string | null) =>
  source && value === formatEventDateInput(source) ? source : parseEventDateInput(value) ?? null
export const serializeEventDraft = (draft: EventDraft, allowed: { clientIds: ReadonlySet<string>; serviceIds: ReadonlySet<string> }) => {
  const error = validateEventDraft(draft)
  if (error) throw new Error(error)
  const { values: v, source } = draft
  const knownClient = (id: string) => allowed.clientIds.has(id) ||
    [source?.clientId, source?.colleagueId, ...(source?.otherContacts || []).map((c) => c.clientId)].includes(id)
  if ([v.clientId, ...(v.isTransferred ? [v.colleagueId] : []), ...draft.otherContacts.map((c) => c.clientId)]
    .some((id) => id && !knownClient(id))) throw new Error('Выбранный контакт недоступен. Выберите клиента из списка')
  const locationUnchanged = ['town', 'street', 'house'].every((key) =>
    v[key as 'town' | 'street' | 'house'].trim() === (source?.address?.[key as 'town' | 'street' | 'house'] || '').trim())
  return {
    eventType: v.eventType.trim(),
    description: v.description === eventPlainText(source?.description) ? source?.description || '' : v.description.trim(),
    eventDate: serializeDate(v.eventDate, source?.eventDate), dateEnd: serializeDate(v.dateEnd, source?.dateEnd),
    status: v.status, clientId: v.clientId || null,
    servicesIds: [...new Set(draft.serviceIds.filter((id) => typeof id === 'string' &&
      (allowed.serviceIds.has(id) || source?.servicesIds?.includes(id))))],
    address: {
      town: v.town.trim(), street: v.street.trim(), house: v.house.trim(), entrance: v.entrance.trim(),
      floor: v.floor.trim(), flat: v.flat.trim(), comment: v.addressComment.trim(),
      latitude: locationUnchanged ? source?.address?.latitude || '' : '',
      longitude: locationUnchanged ? source?.address?.longitude || '' : '',
      link2Gis: locationUnchanged ? source?.address?.link2Gis || '' : '',
      linkYandexNavigator: locationUnchanged ? source?.address?.linkYandexNavigator || '' : '',
    },
    isTransferred: v.isTransferred, colleagueId: v.isTransferred ? v.colleagueId : null,
    calendarImportChecked: v.calendarImportChecked,
    ...(source?.importedFromFile ? { fileImportChecked: v.fileImportChecked } : {}),
    requestCreatedAt: serializeDate(v.requestCreatedAt, draft.cloning ? undefined : source?.requestCreatedAt || source?.createdAt),
    contractSum: Number(v.contractSum), waitDeposit: v.waitDeposit,
    depositExpectedAmount: v.waitDeposit && v.depositExpectedAmount.trim() ? Number(v.depositExpectedAmount) : null,
    depositDueAt: v.waitDeposit ? serializeDate(v.depositDueAt, source?.depositDueAt) : null,
    otherContacts: draft.otherContacts.map(({ clientId, comment }) => ({ clientId, comment: comment.trim() })),
    additionalEvents: serializeEventTasks(draft.tasks).map((task, index) => {
      const original = draft.cloning ? undefined : task._id
        ? source?.additionalEvents?.find((item) => item._id === task._id)
        : source?.additionalEvents?.[Number(draft.tasks[index].localKey.replace(/^task-/, ''))]
      return { ...task, date: serializeDate(draft.tasks[index].dateInput, original?.date),
        description: draft.tasks[index].description === eventPlainText(original?.description) ? original?.description || '' : task.description }
    }),
  }
}
