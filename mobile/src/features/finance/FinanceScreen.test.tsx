import React from 'react'
import { Alert, FlatList, Modal } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import FinanceScreen from '../../../app/(tabs)/finance'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { lightPalette, darkPalette } from '../../shared/ui/theme'
import { MobileTransactionCard } from './MobileTransactionCard'
import type { Transaction } from '../../shared/domain/types'
const mockTransactions = { data: [] as Transaction[], isPending: false, isError: false, isFetching: false, refresh: jest.fn(), refetch: jest.fn() }
const mockRelated = { ...mockTransactions, data: [] as any[], refresh: jest.fn(), refetch: jest.fn() }
const mockDelete = jest.fn(async (..._args: unknown[]) => undefined)
const mockInvalidate = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/mutations', () => ({ deleteLocalEntity: (...args: unknown[]) => mockDelete(...args) }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (kind: string) => kind === 'transactions' ? mockTransactions : mockRelated }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы', labelCapitalized: 'Заказ', genitive: 'заказа' }) }))
const income: Transaction = { _id: 'local-in', type: 'income', amount: 100, date: new Date(2026, 9, 3, 12).toISOString(), category: 'deposit', paymentMethod: 'cash', clientId: 'c', eventId: 'e' }
const obligation: Transaction = { _id: 'promise', type: 'income', amount: 500, date: new Date(2026, 9, 4, 12).toISOString(), paymentMethod: 'obligation', comment: 'Оплатить завтра' }
const setup = () => render(<ThemeProvider storage={null} forcedMode="light"><FinanceScreen /></ThemeProvider>)
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 3, 12)); jest.clearAllMocks()
  Object.assign(mockTransactions, { data: [], isPending: false, isError: false, isFetching: false })
  Object.assign(mockRelated, { data: [], isPending: false, isError: false, isFetching: false })
})
afterEach(() => { act(() => jest.runOnlyPendingTimers()); jest.useRealTimers(); jest.restoreAllMocks() })
it('T: empty/create и no-matches/reset различаются; сводка по умолчанию свёрнута', () => {
  const empty = setup()
  expect(empty.getByText('Транзакции')).toBeTruthy()
  expect(empty.queryByText('Фактические доходы')).toBeNull()
  fireEvent.press(empty.getByText('Добавить транзакцию'))
  expect(router.push).toHaveBeenCalledWith('/finance/edit/new')
  empty.unmount(); mockTransactions.data = [income]
  const screen = setup()
  fireEvent.press(screen.getByTestId('transaction-type-trigger'))
  fireEvent.press(screen.getByRole('button', { name: 'Расходы' }))
  expect(screen.getByText('По выбранным фильтрам транзакций нет')).toBeTruthy()
  fireEvent.press(screen.getByText('Сбросить фильтры'))
  expect(screen.getByTestId('transaction-card-local-in')).toBeTruthy()
})
it('T: overlay типа и связей не размонтирует список; Back и selected', () => {
  mockTransactions.data = [income, obligation]
  const screen = setup(), list = screen.UNSAFE_getByType(FlatList)
  fireEvent.press(screen.getByTestId('transaction-type-trigger'))
  expect(screen.getByTestId('transaction-type')).toHaveStyle({ position: 'absolute' })
  fireEvent.press(screen.getByRole('button', { name: 'Обязательства' }))
  expect(screen.queryByTestId('transaction-card-local-in')).toBeNull()
  expect(screen.getByTestId('transaction-card-promise')).toBeTruthy()
  fireEvent.press(screen.getByTestId('transaction-relations-trigger'))
  fireEvent.press(screen.getByRole('button', { name: 'Без связи' }))
  expect(screen.getByText('По выбранным фильтрам транзакций нет')).toBeTruthy()
  fireEvent.press(screen.getByTestId('transaction-relations-trigger'))
  fireEvent(screen.UNSAFE_getAllByType(Modal).find((modal) => modal.props.visible)!, 'requestClose')
  expect(screen.queryByTestId('transaction-relations')).toBeNull()
  expect(screen.UNSAFE_getByType(FlatList)).toBe(list)
})
it('T: период — draft/apply, отмена без эффекта, active-day dot, reset', () => {
  mockTransactions.data = [income, obligation]
  const screen = setup()
  fireEvent.press(screen.getByTestId('transaction-period-trigger'))
  expect(screen.getByTestId('period-active-2026-10-03')).toBeTruthy()
  fireEvent.press(screen.getByTestId('period-day-2026-10-04'))
  fireEvent.press(screen.getByTestId('transaction-period-outside', { includeHiddenElements: true }))
  expect(screen.getByTestId('transaction-card-local-in')).toBeTruthy()
  fireEvent.press(screen.getByTestId('transaction-period-trigger'))
  fireEvent.press(screen.getByText('Сегодня'))
  fireEvent.press(screen.getByText('Применить'))
  expect(screen.queryByTestId('transaction-card-promise')).toBeNull()
  expect(screen.getByTestId('transaction-card-local-in')).toBeTruthy()
  fireEvent.press(screen.getByTestId('transaction-period-trigger'))
  fireEvent.press(screen.getByText('Сбросить период'))
  expect(screen.getByTestId('transaction-card-promise')).toBeTruthy()
})
it('T: ошибка и загрузка не показывают успешный пустой список; retry всех связей', () => {
  mockRelated.isError = true
  const failed = setup()
  expect(failed.queryByText('Пока нет ни одной транзакции')).toBeNull()
  fireEvent.press(failed.getByText('Повторить чтение'))
  expect(mockTransactions.refetch).toHaveBeenCalledTimes(1)
  expect(mockRelated.refetch).toHaveBeenCalledTimes(2)
  failed.unmount(); mockRelated.isError = false; mockTransactions.isPending = true
  const loading = setup()
  expect(loading.getByLabelText('Загрузка транзакций')).toBeTruthy()
  expect(loading.queryByText('Пока нет ни одной транзакции')).toBeNull()
})
it('T: сводка не включает обязательство в факт и может быть снова скрыта', () => {
  mockTransactions.data = [income, obligation]
  const screen = setup()
  fireEvent.press(screen.getByText('Финансовая сводка'))
  expect(screen.getByText('Фактические доходы')).toBeTruthy()
  expect(screen.getAllByText('100 ₽').length).toBeGreaterThan(0)
  expect(screen.queryByText('600 ₽')).toBeNull()
  fireEvent.press(screen.getByText('Скрыть финансовую сводку'))
  expect(screen.queryByText('Фактические доходы')).toBeNull()
})
it.each([['light', lightPalette], ['dark', darkPalette]] as const)('T: карточка %s — три колонки, категория/клиент/работа, сумма и timestamp отдельно', (mode, palette) => {
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><MobileTransactionCard transaction={{ ...income, amount: 1234567890, comment: 'Комментарий', syncStatus: 'pending' }} client={{ _id: 'c', firstName: 'Анна' }} event={{ _id: 'e', status: 'active', eventType: 'Съёмка', eventDate: '2026-10-03' }} onDelete={jest.fn()} /></ThemeProvider>)
  expect(screen.getByTestId('transaction-date-local-in')).toHaveStyle({ width: 76, borderRightWidth: 1 })
  expect(screen.getByTestId('transaction-shell-local-in')).toHaveStyle({ borderColor: palette.border })
  expect(screen.getByText('Анна')).toBeTruthy(); expect(screen.getByText(/Съёмка —/)).toBeTruthy()
  expect(screen.getByText('Комментарий')).toBeTruthy(); expect(screen.getByText('Ожидает отправки')).toBeTruthy()
  expect(screen.getByTestId('transaction-amount-local-in').props.children).toBe('+1\u00a0234\u00a0567\u00a0890 ₽')
  fireEvent.press(screen.getByTestId('transaction-card-local-in'))
  expect(router.push).toHaveBeenCalledWith('/finance/edit/local-in')
})
it('T: обязательство без знака, плановая дата; menu не открывает редактор и удаление подтверждается', async () => {
  mockTransactions.data = [obligation]
  const alert = jest.spyOn(Alert, 'alert')
  const screen = setup()
  expect(screen.getByTestId('transaction-amount-promise').props.children).toBe('500 ₽')
  expect(screen.getByTestId('transaction-date-promise').props.accessibilityLabel).toContain('Плановая дата')
  fireEvent.press(screen.getByLabelText('Действия с транзакцией'), { stopPropagation: jest.fn() })
  expect(router.push).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Удалить транзакцию'))
  expect(mockDelete).not.toHaveBeenCalled()
  const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress
  await act(async () => { confirm?.(); confirm?.() })
  expect(mockDelete).toHaveBeenCalledTimes(1)
  expect(mockDelete).toHaveBeenCalledWith('transactions', 'promise')
})
