import type { Client, Event, Transaction } from '../../shared/domain/types'
import { getTaskSegment, isPastUnclosed, selectAttention } from './selectors'

// Календарные границы задаём в локальной зоне устройства, без Date.now().
const date = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute)
const iso = (day: number, hour = 0, minute = 0) => date(day, hour, minute).toISOString()
const now = date(1, 12)
const event = (values: Partial<Event> = {}): Event => ({ _id: 'e1', status: 'active', ...values })
const select = (events: Event[], transactions: Transaction[] = [], clients: Client[] = []) => selectAttention(events, transactions, clients, now)

describe('attention selectors', () => {
  it('пустой cache не придумывает задачи, сообщения или даты', () => {
    expect(select([])).toEqual({ groups: { overdue: [], today: [], tomorrow: [] }, pending: { overdue: 0, today: 0, tomorrow: 0 },
      deposits: [], upcoming: [], clientDates: [], pastRequests: [], withoutNextStep: [], pastUnclosed: [] })
  })
  it('просрочено по времени, границы today/tomorrow полуоткрытые', () => {
    expect(getTaskSegment(iso(1, 11, 59), now)).toBe('overdue')
    expect(getTaskSegment(iso(1, 12), now)).toBe('today')
    expect(getTaskSegment(iso(1, 23, 59), now)).toBe('today')
    expect(getTaskSegment(iso(2), now)).toBe('tomorrow')
    expect(getTaskSegment(iso(3), now)).toBeNull()
    expect(getTaskSegment('invalid', now)).toBeNull()
    expect(getTaskSegment(iso(1), date(1))).toBe('today')
    expect(getTaskSegment(iso(1, 23, 59), date(2))).toBe('overdue')
  })
  it('без даты работы задачи остаются видимыми, без срока задача не становится просроченной', () => {
    const data = select([event({ additionalEvents: [{ title: 'Без срока' }, { date: iso(1, 13) }] })])
    expect(data.pending.today).toBe(1)
    expect(data.pending.overdue).toBe(0)
    expect(data.upcoming).toEqual([])
    expect(data.pastUnclosed).toEqual([])
  })
  it('done со сроком сегодня/завтра остаётся в секции, независимо от doneAt', () => {
    const data = select([event({ additionalEvents: [
      { title: 'Сегодня done', date: iso(1, 16), done: true, doneAt: iso(0, 16) },
      { title: 'Завтра done', date: iso(2, 16), done: true },
      { title: 'Pending', date: iso(1, 18) },
    ] })])
    expect(data.groups.today.map((item) => item.task.title)).toEqual(['Pending', 'Сегодня done'])
    expect(data.groups.tomorrow).toHaveLength(1)
    expect(data.pending).toEqual({ overdue: 0, today: 1, tomorrow: 0 })
  })
  it('done с просроченным сроком виден только при doneAt сегодня и остаётся в overdue', () => {
    const data = select([event({ additionalEvents: [
      { title: 'Сегодня', date: iso(0), done: true, doneAt: iso(1) },
      { title: 'Вчера', date: iso(0), done: true, doneAt: iso(0, 23, 59) },
      { title: 'Утро', date: iso(1, 9), done: true, doneAt: iso(1, 10) },
      { title: 'Без doneAt', date: iso(0), done: true },
    ] })])
    expect(data.groups.overdue.map((item) => item.task.title)).toEqual(['Сегодня', 'Утро'])
    expect(data.pending.overdue).toBe(0)
    expect(selectAttention([event({ additionalEvents: data.groups.overdue.map((item) => item.task) })], [], [], date(2)).groups.overdue).toEqual([])
  })
  it('done без срока / позднее виден только выполненным сегодня, в today', () => {
    const data = select([event({ additionalEvents: [
      { title: 'Без срока', done: true, doneAt: iso(1) },
      { title: 'Позднее', date: iso(8), done: true, doneAt: iso(1, 11) },
      { title: 'Старый', date: iso(8), done: true, doneAt: iso(0) },
      { title: 'Некорректная дата', date: 'bad', done: true, doneAt: 'bad' },
    ] })])
    expect(data.groups.today.map((item) => item.task.title)).toEqual(['Без срока', 'Позднее'])
    expect(data.pending.today).toBe(0)
  })
  it('задатки: только active/waitDeposit, положительный deposit или advance снимает ожидание', () => {
    const events = ['paid', 'advance', 'zero', 'expense', 'other', 'future', 'undated', 'draft', 'closed', 'canceled'].map((id) => event({
      _id: id, waitDeposit: true, depositDueAt: id === 'undated' ? null : id === 'future' ? iso(2) : iso(1, 12),
      status: ['draft', 'closed', 'canceled'].includes(id) ? id as Event['status'] : 'active',
    }))
    const transactions = ['paid', 'advance', 'zero', 'expense', 'other'].map((id): Transaction => ({
      _id: id, eventId: id, type: id === 'expense' ? 'expense' : 'income', amount: id === 'zero' ? 0 : 1,
      category: id === 'other' ? 'client_payment' : id === 'advance' ? 'advance' : 'deposit',
    }))
    const data = select(events, transactions)
    expect(data.deposits.map((item) => item._id)).toEqual(['zero', 'expense', 'other', 'future', 'undated'])
    expect(data.groups.overdue.map((item) => item.event._id)).toEqual(['zero', 'expense', 'other'])
    expect(data.pending.overdue).toBe(3)
  })
  it('closed/canceled исключены, задачи прошедшей незакрытой работы не теряются', () => {
    const events = ['active', 'draft', 'closed', 'canceled'].map((status) => event({ _id: status, status: status as Event['status'],
      eventDate: iso(0), additionalEvents: [{ date: iso(0) }, { date: iso(1, 13), done: true }] }))
    const data = select(events)
    expect(data.groups.overdue.map((item) => item.event._id)).toEqual(['active', 'draft'])
    expect(data.groups.today.map((item) => item.event._id)).toEqual(['active', 'draft'])
    expect(data.pastUnclosed.map((item) => item._id)).toEqual(['active'])
    expect(isPastUnclosed(event({ eventDate: iso(0), isTransferred: true }), now)).toBe(false)
  })
  it('многодневные: dateEnd определяет закрытие, текущая работа входит в 3 дня', () => {
    const data = select([
      event({ _id: 'ongoing', eventDate: iso(0), dateEnd: iso(2) }),
      event({ _id: 'today', eventDate: iso(1, 8) }),
      event({ _id: 'third', eventDate: iso(3, 23, 59) }),
      event({ _id: 'outside', eventDate: iso(4) }),
      event({ _id: 'finished', eventDate: iso(-1), dateEnd: iso(0) }),
      event({ _id: 'at-now', eventDate: iso(0), dateEnd: iso(1, 12) }),
    ])
    expect(data.upcoming.map((item) => item._id)).toEqual(['ongoing', 'at-now', 'today', 'third'])
    expect(data.pastUnclosed.map((item) => item._id)).toEqual(['today', 'finished'])
  })
  it('даты клиентов ежегодные, сортируются через границу года и не ограничены 12', () => {
    const clients: Client[] = [{ _id: 'c', significantDates: [
      { title: 'Январь', date: '2000-01-01T12:00:00' }, { title: 'Сегодня', date: '2000-12-31T12:00:00' }, { date: 'invalid' },
    ] }]
    const data = selectAttention([], [], clients, new Date(2026, 11, 31, 12))
    expect(data.clientDates.map((item) => [item.title, item.daysLeft])).toEqual([['Сегодня', 0], ['Январь', 1]])
    const many = select([event({ additionalEvents: Array.from({ length: 15 }, () => ({ date: iso(1, 16) })) })])
    expect(many.pending.today).toBe(15)
    expect(many.groups.today).toHaveLength(15)
  })
  it('не изменяет входные объекты', () => {
    const input = [event({ additionalEvents: [{ date: iso(1, 16), done: true, doneAt: iso(1) }] })]
    const before = JSON.stringify(input)
    select(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

it('ALIGN: прошедшие заявки отдельны от отсутствия шага, просроченная задача остаётся назначенной', () => {
  const now = new Date('2026-10-01T12:00:00Z')
  const events: Event[] = [
    { _id: 'past', status: 'draft', eventDate: '2026-09-01', additionalEvents: [{ title: 'Позвонить', date: '2026-09-20' }] },
    { _id: 'empty', status: 'draft' },
    { _id: 'overdue', status: 'draft', additionalEvents: [{ title: 'Назначено', date: '2026-09-20' }] },
    { _id: 'invalid', status: 'draft', dateEnd: 'invalid', additionalEvents: [{ title: 'Без срока', date: 'bad' }] },
    { _id: 'done', status: 'draft', additionalEvents: [{ title: 'Готово', date: '2026-09-20', done: true }] },
    { _id: 'closed', status: 'closed', eventDate: '2026-09-01' },
  ]
  const result = selectAttention(events, [], [], now)
  expect(result.pastRequests.map((event) => event._id)).toEqual(['past'])
  expect(result.withoutNextStep.map((event) => event._id)).toEqual(['empty', 'invalid', 'done'])
  expect(result.groups.overdue.map((item) => item.event._id)).toEqual(['past', 'overdue'])
})
