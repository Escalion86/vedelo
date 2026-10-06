import React from 'react'
import { Alert, FlatList, Modal } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import ClientsScreen from '../../../app/(tabs)/clients'
import { MobileClientCard } from './MobileClientCard'
import { clientSummary } from './clientList'
import type { Client, Event } from '../../shared/domain/types'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы' }) }))
const mockInvalidate = jest.fn(async () => undefined)
const mockDelete = jest.fn(async (..._args: unknown[]) => undefined)
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/mutations', () => ({ deleteLocalEntity: (...args: unknown[]) => mockDelete(...args) }))
jest.mock('../../shared/ui/QuickContacts', () => ({
  QuickContacts: ({ client, maxVisible }: any) => { const { Text } = require('react-native'); return <Text testID={`quick-${client._id}`}>{maxVisible}</Text> },
  QuickActionsSheet: ({ visible, children }: any) => visible ? children : null,
}))
const mockClients = { data: [] as Client[], isError: false, isPending: false, isFetching: false, refetch: jest.fn(), refresh: jest.fn() }
const mockEvents = { ...mockClients, data: [] as Event[], refetch: jest.fn(), refresh: jest.fn() }
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (kind: string) => kind === 'clients' ? mockClients : mockEvents }))
const setup = (dark = false) => render(<ThemeProvider storage={null} forcedMode={dark ? 'dark' : 'light'}><ClientsScreen /></ThemeProvider>)
const client: Client = { _id: 'local-a', firstName: 'Очень длинное имя клиента без обрезания контактов', preferredContactChannel: 'max', comment: '<p>Комментарий</p>', messengerPushMuted: true, syncStatus: 'pending' }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks()
  Object.assign(mockClients, { data: [], isError: false, isPending: false, isFetching: false })
  Object.assign(mockEvents, { data: [], isError: false, isPending: false, isFetching: false })
})
afterEach(() => { act(() => jest.runOnlyPendingTimers()); jest.useRealTimers() })
it('R: пустая адресная книга предлагает создать; пустой поиск — только сброс', () => {
  const empty = setup()
  fireEvent.press(empty.getByText('Создать клиента'))
  expect(router.push).toHaveBeenCalledWith('/clients/edit/new')
  empty.unmount()
  mockClients.data = [client]
  const screen = setup()
  fireEvent.changeText(screen.getByTestId('clients-search'), 'не существует')
  expect(screen.getByText('Ничего не найдено')).toBeTruthy()
  expect(screen.queryByText('Создать клиента')).toBeNull()
  fireEvent.press(screen.getByText('Сбросить фильтры'))
  expect(screen.getByTestId('client-card-local-a')).toBeTruthy()
})
it('R: overlay 260 dp не размонтирует список, выбранная группа/Back/сброс сохраняют state', () => {
  mockClients.data = [client, { _id: 'b', firstName: 'Борис' }]
  mockEvents.data = [{ _id: 'e', status: 'draft', clientId: client._id }]
  const screen = setup()
  const list = screen.UNSAFE_getByType(FlatList)
  fireEvent.press(screen.getByTestId('clients-filters-trigger'))
  expect(screen.getByTestId('clients-filters')).toHaveStyle({ position: 'absolute', width: 260 })
  fireEvent.press(screen.getByRole('button', { name: 'С заявками' }))
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
  expect(screen.getByRole('button', { name: 'С заявками' })).toBeTruthy()
  expect(screen.queryByTestId('client-card-b')).toBeNull()
  expect(screen.UNSAFE_getByType(FlatList)).toBe(list)
  fireEvent.press(screen.getByRole('button', { name: 'С заявками' }))
  expect(screen.getByTestId('client-card-b')).toBeTruthy()
})
it('R: ошибка связанных данных не выглядит как 0 заявок; повторяет оба чтения', () => {
  mockClients.data = [client]; mockEvents.isError = true
  const screen = setup()
  expect(screen.queryByText('Клиентов пока нет')).toBeNull()
  expect(screen.queryByTestId('client-card-local-a')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение'))
  expect(mockEvents.refetch).toHaveBeenCalledTimes(1)
  expect(mockClients.refetch).toHaveBeenCalledTimes(1)
})
it('R: загрузка не объявляет отсутствие клиентов', () => {
  mockClients.isPending = true
  const screen = setup()
  expect(screen.getByLabelText('Загрузка клиентов')).toBeTruthy()
  expect(screen.queryByText('Клиентов пока нет')).toBeNull()
})
it.each([['light', lightPalette], ['dark', darkPalette]] as const)('R: карточка %s — имя в одну строку, разделители, предпочтение, muted и отдельный pending', (mode, palette) => {
  const events: Event[] = [{ _id: 'e', clientId: client._id, status: 'draft', eventDate: '2026-10-01' }]
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><MobileClientCard client={client} summary={clientSummary(client._id, events)} onDelete={jest.fn()} /></ThemeProvider>)
  expect(screen.getByText(client.firstName!).props.numberOfLines).toBe(1)
  expect(screen.getByText('Предпочитает MAX')).toBeTruthy()
  expect(screen.getByLabelText('Push-уведомления отключены')).toBeTruthy()
  expect(screen.getByText('Ждём ответа')).toBeTruthy()
  expect(screen.getByText('Заявки 1')).toBeTruthy()
  expect(screen.getByText('Ожидает отправки')).toBeTruthy()
  expect(screen.getByTestId('client-shell-local-a')).toHaveStyle({ borderColor: palette.border })
  fireEvent.press(screen.getByTestId('client-card-local-a'))
  expect(router.push).toHaveBeenCalledWith('/clients/local-a')
})
it.each(['failed', 'conflict'] as const)('R: %s не подписывается «Офлайн» и ведёт в синхронизацию', (syncStatus) => {
  const screen = render(<ThemeProvider storage={null}><MobileClientCard client={{ ...client, syncStatus }} summary={clientSummary(client._id, [])} onDelete={jest.fn()} /></ThemeProvider>)
  expect(screen.queryByText('Офлайн')).toBeNull()
  fireEvent.press(screen.getByLabelText('Открыть синхронизацию'), { stopPropagation: jest.fn() })
  expect(router.push).toHaveBeenCalledWith('/sync')
})
it('R: удаление — подтверждение, outbox и одно действие при повторном подтверждении', async () => {
  mockClients.data = [client]
  const alert = jest.spyOn(Alert, 'alert')
  const screen = setup()
  fireEvent.press(screen.getByLabelText(`Действия с клиентом: ${client.firstName}`), { stopPropagation: jest.fn() })
  fireEvent.press(screen.getByText('Удалить клиента'))
  expect(mockDelete).not.toHaveBeenCalled()
  const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress
  await act(async () => { confirm?.(); confirm?.() })
  expect(mockDelete).toHaveBeenCalledTimes(1)
  expect(mockDelete).toHaveBeenCalledWith('clients', client._id)
  alert.mockRestore()
})
