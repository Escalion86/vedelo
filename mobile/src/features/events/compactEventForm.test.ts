import { createEventDraft } from '../../shared/domain/eventForm'
import type { Client } from '../../shared/domain/types'
import { clientSummary, compactFieldGroups, transferSummary, validationSection } from './compactEventForm'

const colleague = { _id: 'colleague-a', firstName: '', secondName: ' ', thirdName: '' } as Client

it('передача найденному коллеге без ФИО использует согласованный fallback _id', () => {
  const draft = createEventDraft()
  draft.values.isTransferred = true
  draft.values.colleagueId = colleague._id
  expect(transferSummary(draft, [colleague])).toBe('Передано: colleague-a')
})
it('сводка передачи учитывает сохранённый флаг, неизвестного коллегу и имя', () => {
  const draft = createEventDraft()
  draft.values.colleagueId = colleague._id
  expect(transferSummary(draft, [colleague])).toBe('')
  draft.values.isTransferred = true
  expect(transferSummary(draft, [])).toBe('Передано коллеге')
  draft.values.colleagueId = ''
  expect(transferSummary(draft, [colleague])).toBe('Передано коллеге')
  draft.values.colleagueId = colleague._id
  expect(transferSummary(draft, [{ ...colleague, firstName: ' Анна ', secondName: ' Иванова ', thirdName: ' Петровна ' }])).toBe('Передано: Анна Иванова Петровна')
})
it('сводка клиента различает пустую, недоступную и найденную связь', () => {
  const draft = createEventDraft()
  expect(clientSummary(draft, [])).toBe('Клиент не выбран')
  draft.values.clientId = colleague._id
  expect(clientSummary(draft, [])).toBe('Клиент недоступен на устройстве')
  expect(clientSummary(draft, [colleague])).toBe(colleague._id)
})
it.each([
  ['Выберите коллегу', 'details'], ['Некорректная дата заявки', 'details'], ['Выберите клиента', 'client'],
  ['Укажите срок контакта', 'tasks'], ['Укажите причину отмены', 'status'], ['Некорректная сумма', 'finance'],
  ['Укажите дату начала', 'dates'],
])('ошибка %s раскрывает соответствующий раздел', (message, section) => {
  expect(validationSection(message)).toBe(section)
})
it('группы подсветки включают передачу, даты, адрес, финансы и статус', () => {
  expect(compactFieldGroups.details).toEqual(expect.arrayContaining(['isTransferred', 'colleagueId']))
  expect(compactFieldGroups.dates).toEqual(['eventDate', 'dateEnd'])
  expect(compactFieldGroups.location).toContain('addressComment')
  expect(compactFieldGroups.finance).toContain('depositExpectedAmount')
  expect(compactFieldGroups.status).toContain('cancelReason')
})
