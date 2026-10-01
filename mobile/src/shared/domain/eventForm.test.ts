import {
  formatEventDateInput,
  parseEventDateInput,
  serializeEventTasks,
  validateEventDates,
  type EventTaskDraft,
} from './eventForm'

const task = (overrides: Partial<EventTaskDraft> = {}): EventTaskDraft => ({
  localKey: 'task-1',
  title: 'Перезвонить',
  dateInput: '2026-08-01 12:00',
  done: false,
  ...overrides,
})

describe('event form dates', () => {
  it('parses valid local input and rejects incomplete values', () => {
    expect(parseEventDateInput('2026-08-15 18:30')).toMatch(/^2026-08-15T/)
    expect(parseEventDateInput('2026-08-15')).toBe(new Date(2026, 7, 15, 0, 0).toISOString())
    expect(parseEventDateInput('2026-02-30 18:30')).toBeUndefined()
    expect(parseEventDateInput('')).toBeNull()
  })

  it('formats ISO value without shifting the displayed local time', () => {
    const source = new Date(2026, 7, 15, 18, 30).toISOString()
    expect(formatEventDateInput(source)).toBe('2026-08-15 18:30')
  })

  it('validates the end date and every contact task', () => {
    expect(validateEventDates({
      eventDate: '2026-08-15 18:00',
      dateEnd: '2026-08-15 17:00',
      depositDueAt: '',
      tasks: [],
    })).toBe('Дата окончания не может быть раньше даты начала')
    expect(validateEventDates({
      eventDate: '',
      dateEnd: '',
      depositDueAt: '',
      tasks: [task({ title: '' })],
    })).toBe('У каждого следующего контакта должно быть название')
  })

  it('serializes task state for the sync payload', () => {
    expect(serializeEventTasks([task({ _id: 'server-task', description: '  После сметы  ' })]))
      .toEqual([expect.objectContaining({
        _id: 'server-task',
        title: 'Перезвонить',
        description: 'После сметы',
        done: false,
      })])
  })
})

import { createEventDraft, eventPlainText, eventSection, serializeEventDraft, validateEventDraft } from './eventForm'
import type { Event } from './types'
const allowed = { clientIds: new Set(['local-client']), serviceIds: new Set(['service']) }
const fixture: Event = { _id: 'local-event', status: 'active', eventType: 'Заказ',
  eventDate: '2026-10-03T11:32:17.123+07:00', dateEnd: '2026-10-03T12:00:00+07:00',
  description: '<p>Описание &amp; условия</p>', clientId: 'local-client',
  contractSum: 100, servicesIds: ['archived-service'], calendarImportChecked: false }

it('дата без времени разбирается и отображается в локальной зоне', () => {
  expect(parseEventDateInput('2026-10-03')).toBe(new Date(2026, 9, 3).toISOString())
  expect(formatEventDateInput('2026-10-03')).toBe('2026-10-03 00:00')
  expect(parseEventDateInput('2026-13-03')).toBeUndefined()
  expect(parseEventDateInput('2026-01-03 24:00')).toBeUndefined()
  expect(parseEventDateInput('2026-01-03T11:00Z')).toBeUndefined()
})
it('serialization сохраняет точность исходных дат и HTML при правке другого поля', () => {
  const draft = createEventDraft(fixture)
  expect(draft.values.description).toBe('Описание & условия')
  draft.values.eventType = 'Другой тип'
  const result = serializeEventDraft(draft, allowed)
  expect(result).toMatchObject({ eventDate: fixture.eventDate, dateEnd: fixture.dateEnd,
    description: fixture.description, clientId: 'local-client', servicesIds: ['archived-service'] })
  draft.values.eventDate = '2026-10-03 10:30'
  draft.values.description = 'Новый текст'
  expect(serializeEventDraft(draft, allowed)).toMatchObject({ eventDate: new Date(2026, 9, 3, 10, 30).toISOString(), description: 'Новый текст' })
})
it('фильтрует неизвестные услуги и не переносит служебные и web-only поля', () => {
  const draft = createEventDraft({ ...fixture, tenantId: ' чужой ', role: 'admin', showOnSite: true } as Event)
  draft.serviceIds = ['service', 'service', 'unknown', 'archived-service']
  Object.assign(draft.values, { tenantId: 'foreign', _id: 'other', $set: { status: 'closed' }, images: ['url'] })
  const result = serializeEventDraft(draft, allowed)
  expect(result.servicesIds).toEqual(['service', 'archived-service'])
  for (const key of ['tenantId', 'role', '_id', '$set', 'showOnSite', 'images', 'source', 'localKey']) expect(result).not.toHaveProperty(key)
  draft.values.clientId = 'foreign-client'
  expect(() => serializeEventDraft(draft, allowed)).toThrow('контакт недоступен')
})
it('проверяет статус, суммы, дату заявки и коллегу', () => {
  const draft = createEventDraft(fixture)
  draft.values.status = 'finished' as Event['status']
  expect(validateEventDraft(draft)).toContain('статус')
  draft.values.status = 'closed'
  draft.values.contractSum = '-1'
  expect(validateEventDraft(draft)).toContain('неотрицательными')
  draft.values.contractSum = 'Infinity'
  expect(validateEventDraft(draft)).toContain('неотрицательными')
  draft.values.contractSum = '0'
  draft.values.requestCreatedAt = '2026-02-30'
  expect(validateEventDraft(draft)).toContain('дату заявки')
  draft.values.requestCreatedAt = '2026-10-01'
  draft.values.isTransferred = true
  expect(validateEventDraft(draft)).toContain('коллегу')
  draft.values.colleagueId = 'local-client'
  expect(validateEventDraft(draft)).toBe('')
  expect(serializeEventDraft(draft, allowed).colleagueId).toBe('local-client')
})
it.each(['draft', 'active', 'closed', 'canceled'] as const)('сохраняет допустимый статус %s', (status) => {
  expect(serializeEventDraft(createEventDraft({ ...fixture, status, cancelReason: status === 'canceled' ? 'Передумал' : '' }), allowed).status).toBe(status)
})
it('недопустимая вкладка заменяется общими данными; HTML преобразуется в текст', () => {
  expect(eventSection(['finance'])).toBe('general')
  expect(eventSection('unknown')).toBe('general')
  expect(eventSection('contacts')).toBe('contacts')
  expect(eventPlainText('<p>Привет<br>мир &#33;</p><script>bad()</script>')).toBe('Привет\nмир !')
})
it('правка локации очищает прежние координаты и ссылки навигации', () => {
  const draft = createEventDraft({ ...fixture, address: { town: 'Красноярск', latitude: '56', longitude: '92', link2Gis: 'https://2gis.ru/old' } })
  expect(serializeEventDraft(draft, allowed).address.latitude).toBe('56')
  draft.values.town = 'Москва'
  expect(serializeEventDraft(draft, allowed).address).toMatchObject({ town: 'Москва', latitude: '', longitude: '', link2Gis: '' })
})
it('сериализует общие поля и проверку импорта, сохраняет задачи без server ID', () => {
  const draft = createEventDraft({ ...fixture, importedFromFile: true, additionalEvents: [{ title: 'Задача', date: fixture.eventDate, description: '<p>Детали</p>', done: true }] })
  draft.values.fileImportChecked = true
  draft.values.calendarImportChecked = true
  draft.values.isTransferred = true
  draft.values.colleagueId = 'local-client'
  draft.values.entrance = ' 2 '
  expect(serializeEventDraft(draft, allowed)).toMatchObject({ fileImportChecked: true, calendarImportChecked: true,
    isTransferred: true, colleagueId: 'local-client', address: { entrance: '2' },
    additionalEvents: [{ title: 'Задача', date: fixture.eventDate, description: '<p>Детали</p>', done: true }] })
  expect(createEventDraft({ ...fixture, additionalEvents: [{ _id: 'task', done: true }] }, true).tasks[0])
    .toMatchObject({ _id: undefined, done: false, doneAt: null })
})

it('ALIGN: тип/описание/услуги необязательны, клиент обязателен, дата не нужна только draft', () => {
  const draft = createEventDraft()
  expect(validateEventDraft(draft)).toBe('Выберите клиента')
  draft.values.clientId = 'local-client'
  expect(validateEventDraft(draft)).toBe('')
  draft.values.status = 'active'
  expect(validateEventDraft(draft)).toBe('Укажите дату начала')
  draft.values.eventDate = '2026-10-15'
  expect(validateEventDraft(draft)).toBe('')
  draft.values.status = 'canceled'
  expect(validateEventDraft(draft)).toBe('Укажите причину отмены')
  draft.values.cancelReason = ' Передумал '
  expect(serializeEventDraft(draft, allowed).cancelReason).toBe('Передумал')
})

it('ALIGN: при возврате отменённой заявки в работу прежняя причина очищается', () => {
  const draft = createEventDraft({ ...fixture, status: 'canceled', cancelReason: 'Отказ' })
  draft.values.status = 'active'
  expect(serializeEventDraft(draft, allowed).cancelReason).toBe('')
})
