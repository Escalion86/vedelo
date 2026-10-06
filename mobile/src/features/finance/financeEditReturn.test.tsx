import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import TransactionEditScreen from '../../../app/finance/edit/[id]'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'

let mockParams: Record<string, unknown>
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockSave = jest.fn()
const mockInvalidate = jest.fn(async () => undefined)
const mockDispatch = jest.fn()
const mockGet = jest.fn()
let mockClients: any[] = []
let mockEvents: any[] = []
let mockPrevented = false
let mockOnRemove: (event: any) => void

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-router', () => ({
  router: { replace: (path: unknown) => mockReplace(path), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: mockDispatch }),
}))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({
  listCachedEntities: async (kind: string) => kind === 'events' ? mockEvents : mockClients,
  getCachedEntity: () => mockGet(),
}))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args), deleteLocalEntity: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ genitive: 'заказа', accusative: 'заказ', labelCapitalized: 'Заказ', mode: 'events' }) }))

const renderScreen = () => render(
  <ThemeProvider storage={null} forcedMode="light">
    <TransactionEditScreen />
  </ThemeProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'new', eventId: 'local-event', returnTo: 'event' }
  mockSave.mockResolvedValue({ _id: 'local-transaction' })
  mockGet.mockResolvedValue(null)
  mockClients = [{ _id: 'local-client', firstName: 'Анна' }]
  mockEvents = [{ _id: 'local-event', status: 'active', clientId: 'local-client', eventType: 'Съёмка' }]
})

it('Q: транзакция из редактора работы возвращается в работу, а не в список', async () => {
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '5000')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityType: 'transactions', values: { amount: 5000, eventId: 'local-event' } })
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
  expect(mockReplace).not.toHaveBeenCalled()
})

it('U: категории зависят от типа; кнопка налога считает 6% договорённости', async () => {
  mockEvents[0].contractSum = 15000
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  expect(screen.queryByText('Налоги')).toBeNull()
  fireEvent.press(screen.getByText('Расход'))
  fireEvent.press(screen.getByText('Налоги'))
  fireEvent.press(screen.getByText('6% от договорённости'))
  expect(screen.getByTestId('transaction-amount').props.value).toBe('900')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values).toMatchObject({ amount: 900, type: 'expense', category: 'taxes' })
})

it('Q: обычное сохранение транзакции по-прежнему открывает список транзакций', async () => {
  mockParams = { id: 'new', eventId: 'local-event' }
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '5000')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/finance'))
  expect(mockBack).not.toHaveBeenCalled()
})

it('U: отсутствующая транзакция не превращается в пустую форму', async () => {
  mockParams = { id: 'missing' }
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByText('Транзакция не найдена в локальных данных')).toBeTruthy())
  expect(screen.queryByTestId('save-transaction')).toBeNull()
})
it('U: исходный timestamp сохранён при правке только комментария, aliases нормализованы', async () => {
  const date = '2026-10-03T05:20:33.123Z'
  mockParams = { id: 'saved' }
  mockGet.mockResolvedValue({ _id: 'saved', type: 'income', amount: 100, category: 'advance', paymentMethod: 'cash', date })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-comment')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-comment'), 'Заметка')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ date, category: 'deposit', comment: 'Заметка' }) })))
})
it('U: обязательство требует фактического времени, в том числе при оплате в тот же день', async () => {
  mockParams = { id: 'saved' }
  mockGet.mockResolvedValue({ _id: 'saved', type: 'income', amount: 100, paymentMethod: 'obligation', date: new Date(2026, 9, 3, 12, 0).toISOString() })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.press(screen.getByRole('button', { name: 'Наличные' }))
  fireEvent.press(screen.getByTestId('save-transaction'))
  expect(screen.getByText('После исполнения обязательства укажите фактическую дату и время оплаты')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Время'), '12:01')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ paymentMethod: 'cash', date: new Date(2026, 9, 3, 12, 1).toISOString() }) })))
})
it('U: неизвестная связь и закрытая исходная работа не обходятся прямым route', async () => {
  mockParams = { id: 'new', eventId: 'missing' }
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '100')
  fireEvent.press(screen.getByTestId('save-transaction'))
  expect(screen.getByText('Транзакции можно изменять только у активного заказа')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  screen.unmount()
  mockParams = { id: 'closed-t' }
  mockGet.mockResolvedValue({ _id: 'closed-t', eventId: 'local-event', type: 'income', amount: 100, date: '2026-10-03' })
  mockEvents[0].status = 'closed'
  const locked = renderScreen()
  await waitFor(() => expect(locked.getByText('Редактирование недоступно: связанная работа не активна или отсутствует.')).toBeTruthy())
  fireEvent.press(locked.getByLabelText('Очистить: Заказ'))
  fireEvent.press(locked.getByTestId('save-transaction'))
  expect(mockSave).not.toHaveBeenCalled()
})
it('U: ошибка save сохраняет черновик и не отправляет второй запрос', async () => {
  let rejectSave!: (reason: Error) => void
  mockSave.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '100,50')
  fireEvent.changeText(screen.getByTestId('transaction-comment'), 'Не потерять')
  fireEvent.press(screen.getByTestId('save-transaction')); fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  await act(async () => rejectSave(new Error('Ошибка очереди')))
  expect(screen.getByTestId('transaction-amount').props.value).toBe('100,50')
  expect(screen.getByTestId('transaction-comment').props.value).toBe('Не потерять')
  expect(screen.getByText('Ошибка очереди')).toBeTruthy()
})
it('U: смена клиента очищает несовместимую работу, local client/event допустимы', async () => {
  mockClients.push({ _id: 'local-b', firstName: 'Борис' })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-client')).toBeTruthy())
  fireEvent.press(screen.getByTestId('transaction-client'))
  fireEvent.press(screen.getByTestId('transaction-client-option-local-b'))
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '100')
  fireEvent.press(screen.getByTestId('save-transaction'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ clientId: 'local-b', eventId: null }) })))
})
it('U: невалидные дата/время блокируют запись; выход требует подтверждения', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('transaction-amount')).toBeTruthy())
  fireEvent.changeText(screen.getByTestId('transaction-amount'), '100')
  fireEvent.changeText(screen.getByLabelText('Дата'), '2026-02-30')
  fireEvent.changeText(screen.getByLabelText('Время'), '25:00')
  fireEvent.press(screen.getByTestId('save-transaction'))
  expect(screen.getByText('Введите существующую дату ГГГГ-ММ-ДД и время ЧЧ:ММ')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress?.())
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  alert.mockRestore()
})

