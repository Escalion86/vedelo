import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import ClientMergeScreen from '../../../app/clients/[id]/merge'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { Client } from '../../shared/domain/types'

let mockOnline = true
const mockNetwork = jest.fn()
const mockGet = jest.fn()
const mockPost = jest.fn()
const mockRemove = jest.fn(async (..._args: unknown[]) => undefined)
const mockUpsert = jest.fn(async (..._args: unknown[]) => undefined)
const mockSync = jest.fn(async () => undefined)
const mockInvalidate = jest.fn(async () => undefined)
const mockQuery = { data: [] as Client[], isPending: false, isError: false, refetch: jest.fn() }
const target: Client = { _id: 'a', firstName: 'Анна', syncStatus: 'synced' }
const duplicate: Client = { _id: 'b', firstName: 'Борис', syncStatus: 'synced' }
const counts = { events: 1, eventsOtherContacts: 2, eventsColleague: 1, transactions: 1, avitoConversations: 0, avitoMessages: 0, vkConversations: 0, vkMessages: 0, calls: 0, total: 5 }
const preview = { targetClient: target, duplicateClient: duplicate, preview: counts }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: 'a' }) }))
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: () => mockNetwork() }, useNetInfo: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ removeCachedEntity: (...args: unknown[]) => mockRemove(...args), upsertEntities: (...args: unknown[]) => mockUpsert(...args) }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: () => mockSync() }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: () => mockQuery }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы' }) }))
const setup = () => render(<ThemeProvider storage={null} forcedMode="dark"><ClientMergeScreen /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks(); mockOnline = true
  Object.assign(mockQuery, { data: [target, duplicate, { _id: 'c', firstName: 'Вера' }], isPending: false, isError: false })
  mockNetwork.mockResolvedValue({ isConnected: true, isInternetReachable: true })
  mockGet.mockResolvedValue({ success: true, data: preview })
  mockPost.mockResolvedValue({ success: true, data: { client: target, deletedClientId: 'b', moved: counts } })
})
afterEach(() => jest.restoreAllMocks())
it('S: прямой offline route не вызывает API', () => {
  mockOnline = false
  const screen = setup()
  expect(screen.getByText('Объединение клиентов доступно только при подключении к интернету.')).toBeTruthy()
  expect(mockGet).not.toHaveBeenCalled(); expect(mockPost).not.toHaveBeenCalled()
})
it.each(['local-a', 'pending', 'failed', 'conflict'] as const)('S: основной клиент %s не объединяется', (state) => {
  mockQuery.data = [{ ...target, ...(state === 'local-a' ? { _id: 'local-a' } : { syncStatus: state }) }, duplicate]
  const screen = setup()
  expect(screen.getByText('Сначала синхронизируйте основного клиента.')).toBeTruthy()
  expect(mockGet).not.toHaveBeenCalled()
})
it('S: загрузка и ошибка кэша отличаются от требования синхронизировать клиента', () => {
  mockQuery.isPending = true
  const screen = setup()
  expect(screen.getByText('Загрузка клиентов…')).toBeTruthy()
  screen.unmount(); mockQuery.isPending = false; mockQuery.isError = true
  const failed = setup()
  fireEvent.press(failed.getByText('Повторить чтение'))
  expect(mockQuery.refetch).toHaveBeenCalledTimes(1)
})
it('S: выбор другого дубля сбрасывает preview; pending/local не входят в кандидаты', async () => {
  mockQuery.data.push({ _id: 'local-x', firstName: 'Локальный' }, { _id: 'pending', firstName: 'Неотправленный', syncStatus: 'pending' })
  const screen = setup()
  expect(screen.queryByText('Локальный')).toBeNull(); expect(screen.queryByText('Неотправленный')).toBeNull()
  fireEvent.press(screen.getByText('Борис')); fireEvent.press(screen.getByText('Проверить связи'))
  await waitFor(() => expect(screen.getByText('Что будет перенесено')).toBeTruthy())
  fireEvent.press(screen.getByText('Вера'))
  expect(screen.queryByText('Что будет перенесено')).toBeNull()
  expect(mockPost).not.toHaveBeenCalled()
})
it('S: preview/подтверждение/одно POST, readback целевого клиента и инвалидирование связей', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  mockGet.mockResolvedValueOnce({ success: true, data: preview }).mockResolvedValueOnce({ success: true, data: { ...target, telegramPhone: 79991234567 } })
  const screen = setup()
  fireEvent.press(screen.getByText('Борис')); fireEvent.press(screen.getByText('Проверить связи'))
  await waitFor(() => expect(screen.getByText('Что будет перенесено')).toBeTruthy())
  fireEvent.press(screen.getByText('Объединить и удалить дубликат'))
  expect(mockPost).not.toHaveBeenCalled()
  const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress
  await act(async () => { confirm?.(); confirm?.() })
  expect(mockPost).toHaveBeenCalledTimes(1)
  expect(mockPost).toHaveBeenCalledWith('/mobile/v1/clients/a/merge', { duplicateClientId: 'b' })
  expect(mockGet).toHaveBeenLastCalledWith('/mobile/v1/clients/a')
  expect(mockRemove).toHaveBeenCalledWith('clients', 'b')
  expect(mockUpsert).toHaveBeenCalledWith('clients', [expect.objectContaining({ telegramPhone: 79991234567 })])
  expect(mockInvalidate).toHaveBeenCalledTimes(3)
  expect(router.replace).toHaveBeenCalledWith('/clients/a')
})
it('S: потеря сети после подтверждения не отправляет merge', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = setup()
  fireEvent.press(screen.getByText('Борис')); fireEvent.press(screen.getByText('Проверить связи'))
  await waitFor(() => expect(screen.getByText('Что будет перенесено')).toBeTruthy())
  fireEvent.press(screen.getByText('Объединить и удалить дубликат'))
  mockNetwork.mockResolvedValue({ isConnected: false })
  await act(async () => alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress?.())
  expect(mockPost).not.toHaveBeenCalled()
  expect(screen.getByText('Объединение клиентов доступно только при подключении к интернету.')).toBeTruthy()
})
it('S: server 403 не удаляет кэш и не объявляет успех', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = setup()
  fireEvent.press(screen.getByText('Борис')); fireEvent.press(screen.getByText('Проверить связи'))
  await waitFor(() => expect(screen.getByText('Что будет перенесено')).toBeTruthy())
  mockPost.mockRejectedValueOnce(new Error('Нет доступа: 403'))
  fireEvent.press(screen.getByText('Объединить и удалить дубликат'))
  await act(async () => alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress?.())
  expect(screen.getByText('Нет доступа: 403')).toBeTruthy()
  expect(mockRemove).not.toHaveBeenCalled(); expect(router.replace).not.toHaveBeenCalled()
  expect(screen.queryByText('Что будет перенесено')).toBeNull()
})
it('S: preview чужой пары отклоняется до destructive действия', async () => {
  mockGet.mockResolvedValue({ data: { ...preview, targetClient: { _id: 'other-tenant' } } })
  const screen = setup()
  fireEvent.press(screen.getByText('Борис')); fireEvent.press(screen.getByText('Проверить связи'))
  await waitFor(() => expect(screen.getByText('Сервер вернул связи другого клиента')).toBeTruthy())
  expect(mockPost).not.toHaveBeenCalled()
})
