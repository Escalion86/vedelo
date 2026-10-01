import { applyPastPreset, defaultEventFilters, eventInScope, eventPublicApiSource, hasEventFilters,
  isEventImportChecked, selectEvents, statusFilterKeys, type ListEvent } from './filters'
const now = new Date('2026-10-01T00:00:00+07:00')
const event = (_id: string, values: Partial<ListEvent> = {}): ListEvent => ({ _id, status: 'active', ...values })
const past = '2026-09-30T23:59:59.999+07:00'
const future = '2026-10-02T00:00:00+07:00'
const ids = (events: ListEvent[]) => events.map((item) => item._id)

describe('scope navigation and PWA filters', () => {
  it('uses dateEnd, strict boundary, undated/invalid dates without mutating input', () => {
    const events = [event('no-date', { status: 'draft' }), event('past', { eventDate: past }),
      event('boundary', { eventDate: now.toISOString() }), event('multi', { eventDate: past, dateEnd: future }),
      event('invalid', { eventDate: 'bad-date' })]
    expect(ids(selectEvents(events, 'upcoming', defaultEventFilters('upcoming'), now))).toEqual(['multi', 'boundary', 'no-date', 'invalid'])
    expect(ids(selectEvents(events, 'past', defaultEventFilters('past'), now))).toEqual(['past'])
    expect(events[0]._id).toBe('no-date')
    expect(eventInScope(event('end', { eventDate: future, dateEnd: past }), 'past', now)).toBe(true)
  })
  it.each(['draft', 'active', 'canceled', 'closed'] as const)('scope of %s is based on time, independently of status', (status) => {
    expect(eventInScope(event('x', { status, eventDate: future }), 'upcoming', now)).toBe(true)
    expect(eventInScope(event('x', { status, eventDate: past }), 'past', now)).toBe(true)
    expect(eventInScope(event('x', { status }), 'past', now)).toBe(false)
  })
  it('keeps today-before-now in past; tomorrow and midnight boundary in upcoming', () => {
    const noon = new Date('2026-10-01T12:00:00+07:00')
    expect(eventInScope(event('morning', { eventDate: '2026-10-01T09:00:00+07:00' }), 'past', noon)).toBe(true)
    expect(eventInScope(event('same-instant', { eventDate: '2026-09-30T17:00:00Z' }), 'upcoming', now)).toBe(true)
  })
  it('selects status defaults and all-status bypass exactly as PWA', () => {
    const events = ['draft', 'active', 'canceled', 'closed'].map((status) => event(status, { status: status as ListEvent['status'], eventDate: past }))
    expect(ids(selectEvents(events, 'past', defaultEventFilters('past'), now))).toEqual(['active', 'closed'])
    expect(ids(selectEvents(events, 'past', { ...defaultEventFilters('past'), statuses: statusFilterKeys('past') }, now))).toEqual(['draft', 'active', 'canceled', 'closed'])
  })
  it('combines town, import check, status and transfer instead of replacing scope', () => {
    const events = [event('match', { address: { town: 'Красноярск' }, calendarImportChecked: true, isTransferred: true }),
      event('wrong-town', { address: { town: 'Москва' }, calendarImportChecked: true, isTransferred: true }),
      event('unchecked', { address: { town: 'Красноярск' }, isTransferred: true }),
      event('not-transferred', { address: { town: 'Красноярск' }, calendarImportChecked: true })]
    expect(ids(selectEvents(events, 'upcoming', { ...defaultEventFilters('upcoming'), town: 'Красноярск', checked: 'checked', transferred: 'only' }, now))).toEqual(['match'])
    expect(selectEvents(events, 'upcoming', { ...defaultEventFilters('upcoming'), town: 'Нет города' }, now)).toEqual([])
  })
  it('file check takes precedence, ordinary and calendar records use calendarImportChecked', () => {
    expect(isEventImportChecked(event('local'))).toBe(false)
    expect(isEventImportChecked(event('calendar', { calendarImportChecked: true }))).toBe(true)
    expect(isEventImportChecked(event('file', { importedFromFile: true, calendarImportChecked: true }))).toBe(false)
    expect(isEventImportChecked(event('file', { importedFromFile: true, fileImportChecked: true }))).toBe(true)
  })
  it('past presets exclude transferred/canceled/closed/drafts for unclosed; retain town/check', () => {
    const events = [event('open', { eventDate: past }), event('transferred', { eventDate: past, isTransferred: true }),
      event('closed', { status: 'closed', eventDate: past }), event('canceled', { status: 'canceled', eventDate: past }),
      event('draft', { status: 'draft', eventDate: past }), event('multi', { eventDate: past, dateEnd: future })]
    for (const [preset, expected] of [['unclosed', ['open']], ['closed', ['closed']], ['canceled', ['canceled']]] as const) {
      expect(ids(selectEvents(events, 'past', applyPastPreset(defaultEventFilters('past'), preset), now))).toEqual(expected)
    }
    expect(applyPastPreset({ ...defaultEventFilters('past'), town: 'Москва', checked: 'unchecked' }, 'unclosed')).toMatchObject({ town: 'Москва', checked: 'unchecked' })
  })
  it('sorts upcoming API undated first, dated ascending, other undated last; past descending', () => {
    const events = [event('undated'), event('late', { eventDate: future }), event('api', { clientData: { createdViaApi: true, sourceLabel: 'Tilda' } }), event('early', { eventDate: now.toISOString() })]
    expect(ids(selectEvents(events, 'upcoming', defaultEventFilters('upcoming'), now))).toEqual(['api', 'early', 'late', 'undated'])
    expect(ids(selectEvents(events, 'past', defaultEventFilters('past'), new Date('2026-11-01')))).toEqual(['late', 'early'])
    expect(eventPublicApiSource(events[2])).toBe('Tilda')
    expect(eventPublicApiSource(event('legacy', { clientData: { lead: { raw: {}, phone: '123' } } }))).toBe('API')
    expect(eventPublicApiSource(event('manual', { clientData: { source: 'Не API' } }))).toBe('')
  })
  it('detects filter selection regardless of status ordering and resets it', () => {
    expect(hasEventFilters('upcoming', { ...defaultEventFilters('upcoming'), statuses: ['active', 'request'] })).toBe(false)
    expect(hasEventFilters('past', applyPastPreset(defaultEventFilters('past'), 'unclosed'))).toBe(true)
    expect(hasEventFilters('past', defaultEventFilters('past'))).toBe(false)
  })
})
