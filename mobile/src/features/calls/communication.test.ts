import { checkedCall, parseContactDate, phoneDigits, safeHttpUrl, serverId, successfulData, suggestedClient } from './communication'
const id = '111111111111111111111111'
const call = { _id: id, status: 'new' as const, direction: 'incoming' as const }
it.each(['', 'local-1', ` ${id}`, `${id}/x`, [id], null, 123])('Y: literal server ID отклоняет %p', (value) => expect(serverId(value)).toBe(false))
it('Y: literal ID не меняет регистр и требует exact reply', () => {
  const upper = 'AAAAAAAAAAAAAAAAAAAAAAAA'; expect(serverId(upper)).toBe(true)
  expect(() => checkedCall({ ...call, _id: upper.toLowerCase() }, upper)).toThrow()
  expect(() => checkedCall({ ...call, linkedEventId: 'local-x' }, id)).toThrow()
})
it.each(['', '123', '8 123', '79991112233 ext 7', 'phone:79991112233', 'javascript:79991112233', '+79991112233;123'])('Y: телефон не превращает %p в идентификатор', (value) => expect(phoneDigits(value)).toBeNull())
it('Y: только полные номера, пустые и неоднозначные совпадения не выбирают клиента', () => {
  expect(phoneDigits('+7 (999) 111-22-33')).toBe('79991112233'); expect(phoneDigits(89991112233)).toBe('79991112233')
  expect(suggestedClient(call, [{ _id: id, phone: '' }])).toBeNull()
  expect(suggestedClient({ ...call, phone: '+79991112233' }, [{ _id: id, phone: 79991112233 }, { _id: '222222222222222222222222', phone: 89991112233 }])).toBeNull()
  expect(suggestedClient({ ...call, phone: '+79991112233' }, [{ _id: 'local-x', phone: 79991112233 }])).toBeNull()
})
it.each(['2026-02-31 10:00', '2025-02-29 10:00', '2026-13-01 10:00', '2026-10-01 24:00', '2026-10-01 10:60', '2026-10-01', ' 2026-10-01 10:00', '2026-10-01T10:00Z'])('Y: строгая локальная дата %p', (value) => expect(parseContactDate(value)).toBeNull())
it('Y: дата учитывает локальный календарь и високосный год', () => {
  const iso = parseContactDate('2028-02-29 10:15'); expect(iso).not.toBeNull()
  const date = new Date(iso!); expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2028, 1, 29, 10, 15])
})
it.each(['javascript:alert(1)', 'file:///data/audio', 'content://audio', 'https://user:secret@example.org/a', 'https://example.org/\na', 'https://'])('Y: небезопасная запись %p', (value) => expect(safeHttpUrl(value)).toBeNull())
it('Y: HTTP(S) разрешены, success:false/пустой payload не является успехом', () => {
  expect(safeHttpUrl('https://example.invalid/recording?x=1')).toBe('https://example.invalid/recording?x=1')
  expect(() => successfulData({ success: false, data: call })).toThrow(); expect(() => successfulData({ success: true })).toThrow()
})
