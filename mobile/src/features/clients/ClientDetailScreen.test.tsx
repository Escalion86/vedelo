import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import ClientDetailScreen from '../../../app/clients/[id]/index'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { Client, Event, Transaction } from '../../shared/domain/types'
import { lightPalette, darkPalette } from '../../shared/ui/theme'

let mockParams = { id: 'local-a' }
const mockGet = jest.fn()
const mockList = jest.fn()
let mockEvents: Event[] = []
let mockTransactions: Transaction[] = []
const client: Client = { _id: 'local-a', firstName: 'Анна', secondName: 'Иванова', phone: 79991234567, comment: '<p>Важная заметка</p>', preferredContactChannel: 'max', inn: '1234567890', kpp: '123', bankName: 'Банк', significantDates: [{ title: 'День рождения', date: '2000-05-20', comment: 'Поздравить' }] }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => mockParams, useFocusEffect: (fn: () => unknown) => require('react').useEffect(fn, [fn]) }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: (...args: unknown[]) => mockGet(...args), listCachedEntities: (...args: unknown[]) => mockList(...args) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы', labelCapitalized: 'Заказ', accusative: 'заказ' }) }))
jest.mock('../../shared/ui/QuickContacts', () => ({ QuickContacts: () => { const { Text } = require('react-native'); return <Text>Быстрые контакты</Text> } }))
const setup = (mode: 'light' | 'dark' = 'light') => render(<ThemeProvider storage={null} forcedMode={mode}><ClientDetailScreen /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks(); mockParams = { id: 'local-a' }; mockEvents = []; mockTransactions = []
  mockGet.mockResolvedValue(client)
  mockList.mockImplementation(async (kind: string) => kind === 'events' ? mockEvents : mockTransactions)
})
afterEach(() => jest.restoreAllMocks())
it.each([['light', lightPalette], ['dark', darkPalette]] as const)('S: просмотр %s с копированием, контактами, реквизитами и порядком web-блоков', async (mode, palette) => {
  const screen = setup(mode)
  await waitFor(() => expect(screen.getByText('Иванова Анна')).toBeTruthy())
  expect(screen.getByTestId('client-detail-header')).toHaveStyle({ borderColor: palette.border })
  expect(screen.getByText('Комментарий: Важная заметка')).toBeTruthy()
  expect(screen.getByText('Приоритетная связь: MAX')).toBeTruthy()
  expect(screen.getByText('ИНН: 1234567890')).toBeTruthy()
  expect(screen.getByText('КПП: 123')).toBeTruthy()
  expect(screen.getByText('Банк: Банк')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Скопировать номер телефона'))
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('999'))
  fireEvent.press(screen.getByText('Файлы и документы · 0'))
  expect(router.push).toHaveBeenCalledWith('/clients/local-a/documents')
  expect(screen.getByText('Загрузка файлов доступна после синхронизации клиента.')).toBeTruthy()
})
it('S: loading/missing/error не смешиваются, ошибка имеет повтор', async () => {
  let resolve!: (value: Client | null) => void
  mockGet.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  const screen = setup()
  expect(screen.getByLabelText('Загрузка клиента')).toBeTruthy()
  expect(screen.queryByText('Клиент не найден')).toBeNull()
  await act(async () => resolve(null))
  expect(screen.getByText('Клиент не найден')).toBeTruthy()
  screen.unmount()
  mockGet.mockRejectedValueOnce(new Error('База недоступна'))
  const failed = setup()
  await waitFor(() => expect(failed.getByText('База недоступна')).toBeTruthy())
  expect(failed.queryByText('Клиент не найден')).toBeNull()
  fireEvent.press(failed.getByText('Повторить чтение'))
  await waitFor(() => expect(failed.getByText('Иванова Анна')).toBeTruthy())
})
it('S: KPI только основного клиента; связи доп.контакта сохранены в раскрытии', async () => {
  mockEvents = [{ _id: 'own', clientId: client._id, status: 'active', eventType: 'Собственный', eventDate: '2099-01-01' }, { _id: 'extra', clientId: 'b', otherContacts: [{ clientId: client._id }], status: 'active', eventType: 'Другой контакт' }, { _id: 'foreign', clientId: 'b', status: 'active', eventType: 'Чужой' }]
  mockTransactions = [
    { _id: 'income', clientId: client._id, type: 'income', amount: 100, category: 'Получено' },
    { _id: 'expense', clientId: client._id, type: 'expense', amount: 20 },
    { _id: 'obligation', clientId: client._id, type: 'income', amount: 500, paymentMethod: 'obligation' },
    { _id: 'linked', clientId: 'b', eventId: 'extra', type: 'income', amount: 999 },
    { _id: 'foreign', clientId: 'b', type: 'income', amount: 10000 },
  ]
  const screen = setup()
  await waitFor(() => expect(screen.getByText('Иванова Анна')).toBeTruthy())
  expect(screen.getByText('100 ₽')).toBeTruthy(); expect(screen.getByText('80 ₽')).toBeTruthy()
  expect(screen.getByText('Обязательства (не факт оплаты): 500 ₽')).toBeTruthy()
  expect(screen.queryByText('Собственный')).toBeNull()
  fireEvent.press(screen.getByText('Посмотреть'))
  expect(screen.getByText('Другой контакт')).toBeTruthy(); expect(screen.queryByText('Чужой')).toBeNull()
  fireEvent.press(screen.getByText('Собственный'))
  expect(router.push).toHaveBeenCalledWith('/events/own')
  fireEvent.press(screen.getByText('Показать'))
  expect(screen.getByText('+999 ₽')).toBeTruthy(); expect(screen.queryByText('+10 000 ₽')).toBeNull()
})
it('S: история и создание с привязкой используют существующие routes', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = setup()
  await waitFor(() => expect(screen.getByText('Иванова Анна')).toBeTruthy())
  fireEvent.press(screen.getByText('Создать заказ'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/events/edit/new', params: { clientId: 'local-a' } })
  fireEvent.press(screen.getByLabelText('Действия с клиентом'))
  act(() => alert.mock.calls[0][2]?.find((button) => button.text === 'История действий')?.onPress?.())
  expect(router.push).toHaveBeenCalledWith({ pathname: '/history', params: { entityType: 'client', entityId: 'local-a' } })
})
