import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import EventDetailScreen from '../../../app/events/[id]'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import type { Event, Transaction } from '../../shared/domain/types'

let mockEvent: Event
let mockOnline = false
let mockEventError = false
let mockPending = false
const mockSave = jest.fn()
const mockRefetch = jest.fn(async () => undefined)
const mockInvalidate = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: mockEvent._id }), useFocusEffect: jest.fn() }))
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }) }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ labelCapitalized: 'Заказ', pluralGenitive: 'заказов' }) }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (kind: string) => ({
  data: kind === 'events' ? [mockEvent] : kind === 'transactions' ? [{ _id: 'tx', eventId: mockEvent._id, type: 'income', category: 'deposit', amount: 50, paymentMethod: 'obligation' } satisfies Transaction] : [],
  isPending: kind === 'events' && mockPending, isError: kind === 'events' && mockEventError, refetch: mockRefetch,
}) }))
beforeEach(() => {
  jest.clearAllMocks()
  mockEvent = { _id: 'local-event', status: 'active', eventType: 'Заказ', description: '<p>Описание заказа</p>',
    contractSum: 100, calendarImportChecked: false, syncStatus: 'pending',
    additionalEvents: [{ _id: 'task', title: 'Позвонить', done: false }] }
  mockOnline = false; mockEventError = false; mockPending = false
  mockSave.mockResolvedValue(mockEvent)
})
const setup = (dark = false) => render(<ThemeProvider storage={null} forcedMode={dark ? 'dark' : 'light'}><EventDetailScreen /></ThemeProvider>)
it.each(['draft', 'active', 'closed', 'canceled'] as const)('статус %s: финансы, ограничения оплаты и section deep link', (status) => {
  mockEvent.status = status
  const screen = setup()
  expect(Boolean(screen.queryByTestId('event-finance-summary'))).toBe(status !== 'draft')
  expect(screen.getByText('Описание заказа')).toBeTruthy()
  expect(screen.queryByText('<p>Описание заказа</p>')).toBeNull()
  fireEvent.press(screen.getByLabelText('Действия с работой'))
  if (status !== 'active') expect(screen.getByText('Оплату или расход можно добавить только в статусе «Подтверждено».')).toBeTruthy()
  expect(screen.getByText('История появится после первой синхронизации.')).toBeTruthy()
  fireEvent.press(screen.getByText('Изменить: Финансы и Документы'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/events/edit/[id]', params: { id: 'local-event', section: 'finance' } })
})
it.each([false, true])('просмотр использует палитру dark=%s и сохраняет порядок блоков', (dark) => {
  const screen = setup(dark)
  const palette = dark ? darkPalette : lightPalette
  expect(screen.getByText('Описание заказа')).toHaveStyle({ color: palette.text })
  const tree = JSON.stringify(screen.toJSON())
  const blocks = ['event-place-status', 'event-dates', 'event-description', 'event-finance-summary', 'event-details', 'event-contacts', 'event-tasks', 'event-navigation']
  blocks.slice(1).forEach((block, index) => expect(tree.indexOf(block)).toBeGreaterThan(tree.indexOf(blocks[index])))
})
it('offline/local ID: документы доступны, задача идёт через штатную mutation с обработкой ошибки', async () => {
  mockSave.mockRejectedValueOnce(new Error('local write failed'))
  const screen = setup()
  expect(screen.getByText(/Без сети показаны/)).toBeTruthy()
  fireEvent.press(screen.getByText('Документы'))
  expect(router.push).toHaveBeenCalledWith('/events/local-event/documents')
  fireEvent.press(screen.getByRole('checkbox'))
  await screen.findByText('Не удалось сохранить задачу. Попробуйте ещё раз.')
  fireEvent.press(screen.getByRole('checkbox'))
  await waitFor(() => expect(mockInvalidate).toHaveBeenCalled())
  expect(mockSave.mock.calls[1][0]).toMatchObject({ entityType: 'events', entityId: 'local-event', values: { additionalEvents: [expect.objectContaining({ done: true })] } })
})
it('история серверной записи получает привязку к работе', () => {
  mockEvent._id = 'server-event'; mockOnline = true
  const screen = setup()
  fireEvent.press(screen.getByLabelText('Действия с работой'))
  fireEvent.press(screen.getByText('История действий'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/history', params: { entityType: 'event', entityId: 'server-event' } })
})
it('ошибка чтения отличается от загрузки и даёт повтор', () => {
  mockEventError = true
  const screen = setup()
  expect(screen.getByText('Не удалось прочитать работу')).toBeTruthy()
  fireEvent.press(screen.getByText('Повторить'))
  expect(mockRefetch).toHaveBeenCalled()
  screen.unmount(); mockEventError = false; mockPending = true
  const loading = setup()
  expect(loading.getByLabelText('Загрузка работы')).toBeTruthy()
  expect(loading.queryByText('Запись не найдена')).toBeNull()
})
