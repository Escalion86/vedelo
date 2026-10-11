import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { TransactionPeriodFilter } from './TransactionPeriodFilter'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 9, 9, 12)) })
afterEach(() => jest.useRealTimers())
const setup = (onChange = jest.fn()) => render(<ThemeProvider storage={null}><TransactionPeriodFilter range={{ from: '', to: '' }} onChange={onChange} activeDates={new Set(['2026-10-10'])} /></ThemeProvider>)
it.each([
  ['Завтра', { from: '2026-10-10', to: '2026-10-10' }], ['На выходных', { from: '2026-10-10', to: '2026-10-11' }],
])('реальный thin adapter: %s возвращает обе границы сразу', (label, range) => {
  const onChange = jest.fn(), screen = setup(onChange); fireEvent.press(screen.getByTestId('transaction-period-trigger')); fireEvent.press(screen.getByText(label))
  expect(onChange.mock.calls).toEqual([[range]])
})
it('реальный adapter передаёт activeDates; calendar/manual/apply сохраняют ISO interface', () => {
  const onChange = jest.fn(), screen = setup(onChange); fireEvent.press(screen.getByTestId('transaction-period-trigger')); fireEvent.press(screen.getByText('Выбрать даты'))
  expect(screen.getByTestId('period-active-2026-10-10', { includeHiddenElements: true })).toBeTruthy(); expect(screen.getByTestId('period-day-2026-10-10')).toHaveProp('accessibilityHint', 'Есть транзакции')
  fireEvent.press(screen.getByText('Ввести даты вручную')); fireEvent.changeText(screen.getByLabelText('С даты'), '01.10.2026'); fireEvent.changeText(screen.getByLabelText('По дату'), '09.10.2026')
  fireEvent.press(screen.getByText('Применить')); expect(onChange.mock.calls).toEqual([[{ from: '2026-10-01', to: '2026-10-09' }]])
})
