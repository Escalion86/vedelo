import { clientName, clientSummary, selectClients, plainComment } from './clientList'
import type { Client, Event } from '../../shared/domain/types'

const clients: Client[] = [{ _id: 'a', firstName: 'Анна', phone: '+7 (999) 123-45-67', telegram: '@anna', messengerPushMuted: true }, { _id: 'b', firstName: 'Борис' }, { _id: 'local-c', firstName: 'Вера' }]
const events: Event[] = [
  { _id: 'a1', clientId: 'a', status: 'draft', eventDate: '2026-01-01' },
  { _id: 'a2', clientId: 'a', status: 'active', eventDate: '2026-01-01', dateEnd: '2026-12-31' },
  { _id: 'a3', clientId: 'a', status: 'closed', eventDate: '2026-01-02' },
  { _id: 'a4', clientId: 'a', status: 'canceled', eventDate: '2026-01-03' },
  { _id: 'a5', clientId: 'a', status: 'active', eventDate: 'bad' },
  { _id: 'b1', clientId: 'b', status: 'active', eventDate: '2026-10-04', eventType: 'Съёмка' },
  { _id: 'other', clientId: 'other', status: 'draft', eventDate: '2027-01-01' },
]
const now = new Date('2026-10-03T12:00:00Z')
it('R: статусы совпадают с web, dateEnd имеет приоритет; невалидная дата не завершает работу', () => {
  const summary = clientSummary('a', events, now)
  expect(summary.counts).toEqual({ requests: 1, active: 2, finished: 0, closed: 1, canceled: 1 })
  expect(summary.latest?._id).toBe('a4')
  expect(clientSummary('local-c', events, now).latest).toBeNull()
})
it('R: сортировка по последней дате, затем количеству, без смешивания чужих связей', () => {
  expect(selectClients(clients, events, '', 'all', now).map((c) => c._id)).toEqual(['b', 'a', 'local-c'])
  expect(selectClients(clients, events, '', 'requests', now).map((c) => c._id)).toEqual(['a'])
  expect(selectClients(clients, events, '', 'events', now).map((c) => c._id)).toEqual(['b', 'a'])
  expect(selectClients(clients, events, '', 'canceled', now).map((c) => c._id)).toEqual(['a'])
  const same = [{ ...events[0], clientId: 'b', eventDate: null }, { ...events[0], eventDate: null }, { ...events[0], _id: 'a6', eventDate: null }]
  expect(selectClients(clients, same, '', 'all', now)[0]._id).toBe('a')
})
it('R: имя, форматированный телефон, соцсети; local ID доступен и пустое имя имеет fallback', () => {
  expect(selectClients(clients, events, '79991234567', 'all', now)[0]._id).toBe('a')
  expect(selectClients(clients, events, '@ANNA', 'all', now)[0]._id).toBe('a')
  expect(selectClients(clients, events, 'Вера', 'all', now)[0]._id).toBe('local-c')
  expect(clientName({ _id: 'x', secondName: ' Белинский ', firstName: ' Алексей ', thirdName: ' ' })).toBe('Белинский Алексей')
  expect(clientName({ _id: 'x' })).toBe('Без имени')
})
it('R/S: комментарии без сырых html-тегов, пустых строк и опасного содержимого', () => {
  expect(plainComment('<p>Первая &amp; вторая</p><p>строка<br>ещё</p><script>bad()</script>')).toBe('Первая & вторая\nстрока\nещё')
  expect(plainComment('Просто текст')).toBe('Просто текст')
})
