import { calculateStatistics, csvCell, readStatistics, statisticsCsv, statisticsPath, type StatisticsPayload } from './statistics'
const filters = { year: 2026, town: '', status: 'all' as const }
const event = { _id: 'event-1', clientId: 'client-1', eventType: '', description: 'Заказ; «Тест»', eventDate: null, dateEnd: null, status: 'active' as const, contractSum: 1000, address: { town: '', street: '', house: '' } }
const tx = (type: 'income' | 'expense', amount: number, category = '', eventId: string | null = 'event-1') => ({ _id: `${type}-${amount}`, clientId: null, eventId, type, amount, category, date: null, comment: '' })
const data = (transactions: StatisticsPayload['transactions'] = []): StatisticsPayload => ({ filters, events: [event], clients: [], transactions })
test('регрессия доходов, расходов, налогов, комиссий, остатка, маржи и топов', () => {
  const value = calculateStatistics(data([tx('income', 800), tx('expense', 100, 'taxes'), tx('expense', 50, 'organizer'), tx('expense', 20, 'referral_out'), tx('expense', 30, 'transport')]))
  expect(value).toMatchObject({ income: 800, expense: 200, taxes: 100, commissions: 70, paymentLeft: 200, net: 600, margin: 75 })
  expect(value.topEvents[0].profit).toBe(600)
  expect(value.topExpenses.map((entry) => entry.amount)).toEqual([100, 50, 30, 20])
})
test('независимые транзакции входят в итог, но не в финансы работы', () => {
  const value = calculateStatistics(data([tx('income', 1200), tx('income', 300, '', null), tx('expense', 50, '', null), tx('expense', 10, '', 'other-event')]))
  expect(value).toMatchObject({ income: 1500, expense: 60, net: 1440, paymentLeft: 0, margin: 96 })
  expect(value.topEvents[0].profit).toBe(1200)
})
test('пустой набор не создаёт топы и NaN', () => {
  expect(calculateStatistics({ ...data(), events: [] })).toMatchObject({ income: 0, expense: 0, net: 0, margin: 0, paymentLeft: 0, topEvents: [], topExpenses: [] })
})
test('нулевой доход с расходами сохраняет отрицательный итог и нулевую маржу', () => {
  expect(calculateStatistics(data([tx('expense', 25.5)]))).toMatchObject({ net: -25.5, margin: 0, paymentLeft: 1000 })
})
test('топы ограничены пятью и отсортированы, входные массивы не меняются', () => {
  const input = { ...data(Array.from({ length: 8 }, (_, index) => tx('expense', index + 1, String(index)))), events: Array.from({ length: 8 }, (_, index) => ({ ...event, _id: String(index) })) }
  const original = JSON.stringify(input); const value = calculateStatistics(input)
  expect(value.topExpenses.map((entry) => entry.amount)).toEqual([8, 7, 6, 5, 4]); expect(value.topEvents).toHaveLength(5)
  expect(JSON.stringify(input)).toBe(original)
})
test.each([false, null, {}, { success: false, data: data() }, { success: true, data: { ...data(), transactions: {} } }, { success: true, data: data([tx('income', NaN)]) }, { success: true, data: { ...data(), filters: { ...filters, year: 2025 } } }])('невалидный DTO/несовпавший фильтр отвергается (%j)', (response) => {
  expect(() => readStatistics(response, filters)).toThrow()
})
test('валидный sanitizer DTO и фильтры', () => {
  expect(readStatistics({ success: true, data: data() }, filters)).toEqual(data())
  expect(statisticsPath({ year: null, town: 'Красноярск', status: 'draft' })).toContain('status=draft&town=')
  expect(statisticsPath({ year: null, town: '', status: 'all' })).not.toContain('year=')
})
test('CSV: BOM, кириллица, delimiter, кавычки, CR/LF, правильная терминология и строки транзакций', () => {
  const input = data([ { ...tx('income', 100), comment: 'Оплата; "первый"\r\nВторая строка\nТретья' } ])
  input.events[0] = { ...event, description: 'Описание\nРаботы' }
  const csv = statisticsCsv(input, 'Заказ')
  expect(csv[0]).toBe('\ufeff'); expect(csv).toContain('\r\nЗаказ;event-1;'); expect(csv).toContain('"Описание\nРаботы"')
  expect(csv).toContain('"Оплата; ""первый""\r\nВторая строка\nТретья"'); expect(csv).toContain('Транзакция;income-100;')
  expect(csvCell('без спецсимволов')).toBe('без спецсимволов'); expect(csvCell('\r')).toBe('"\r"')
})
