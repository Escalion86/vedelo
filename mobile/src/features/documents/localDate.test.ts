import { documentDateForLocalDay } from './localDate'

describe('дата документа в локальном часовом поясе', () => {
  it('не сдвигает дату на предыдущий день до утра по UTC', () => {
    const localNight = new Date(2026, 9, 3, 1, 15, 0)
    expect(documentDateForLocalDay(localNight)).toBe('2026-10-03')
  })

  it('сохраняет ведущие нули месяца и дня', () => {
    expect(documentDateForLocalDay(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02')
  })
})
