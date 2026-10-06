import { selectTransactions, initialTransactionFilters, toggleRelation, rangeByDay, monthCells, nextWeekend } from './filters'
import { transactionPresentation } from './transactionCard'
import type { Transaction } from '../../shared/domain/types'
const rows: Transaction[] = [
  { _id: 'income', type: 'income', amount: 100, date: new Date(2026, 9, 3, 0).toISOString(), eventId: 'local-event', category: 'advance' },
  { _id: 'expense', type: 'expense', amount: 50, date: new Date(2026, 9, 3, 23, 59, 59, 999).toISOString(), clientId: 'local-client' },
  { _id: 'promise', type: 'income', amount: 500, paymentMethod: 'obligation', date: new Date(2026, 9, 4, 0).toISOString(), comment: 'Завтра' },
  { _id: 'no-date', type: 'income', amount: 10 }, { _id: 'bad-date', type: 'expense', amount: 10, date: 'bad' },
]
it('T: типы не смешивают обязательство с фактическим income/expense', () => {
  expect(selectTransactions(rows, { ...initialTransactionFilters(), type: 'income' }).map((r) => r._id)).toEqual(['income', 'no-date'])
  expect(selectTransactions(rows, { ...initialTransactionFilters(), type: 'obligation' }).map((r) => r._id)).toEqual(['promise'])
})
it('T: период включает обе границы локальных суток и исключает отсутствие/ошибку даты', () => {
  const filters = { ...initialTransactionFilters(), range: { from: '2026-10-03', to: '2026-10-03' } }
  expect(selectTransactions(rows, filters).map((r) => r._id)).toEqual(['expense', 'income'])
  expect(selectTransactions(rows, { ...filters, range: { from: '2026-10-04', to: '' } }).map((r) => r._id)).toEqual(['promise'])
  expect(selectTransactions(rows, initialTransactionFilters())).toHaveLength(5)
})
it('T: связь по клиенту ИЛИ работе; переключатели не выключают обе группы', () => {
  const filters = { ...initialTransactionFilters(), unlinked: false }
  expect(selectTransactions(rows, filters).map((r) => r._id)).toEqual(['expense', 'income'])
  expect(toggleRelation(filters, 'linked')).toEqual(filters)
  expect(toggleRelation(initialTransactionFilters(), 'linked').linked).toBe(false)
})
it('T: календарь, обратный выбор диапазона, новый диапазон и выходные', () => {
  expect(rangeByDay({ from: '', to: '' }, '2026-10-03')).toEqual({ from: '2026-10-03', to: '' })
  expect(rangeByDay({ from: '2026-10-03', to: '' }, '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-03' })
  expect(rangeByDay({ from: '2026-10-01', to: '2026-10-03' }, '2026-10-05')).toEqual({ from: '2026-10-05', to: '' })
  expect(monthCells(new Date(2026, 1, 1)).filter(Boolean)).toHaveLength(28)
  expect(nextWeekend(new Date(2026, 9, 2))).toEqual({ from: '2026-10-03', to: '2026-10-04' })
})
it('T: категория первична, legacy aliases и комментарий не дублируются, обязательство без знака', () => {
  expect(transactionPresentation({ ...rows[0], comment: 'Получено', paymentMethod: 'cash' })).toMatchObject({ title: 'Задаток', comment: 'Получено', amount: '+100 ₽', method: 'Наличные' })
  expect(transactionPresentation({ ...rows[0], category: 'unknown', comment: 'По согласованию' }).title).toBe('По согласованию')
  expect(transactionPresentation(rows[2])).toMatchObject({ title: 'Завтра', comment: '', amount: '500 ₽', dateLabel: 'Плановая дата', kind: 'obligation' })
})
