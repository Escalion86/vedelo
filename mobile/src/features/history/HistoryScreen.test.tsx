import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import HistoryScreen from '../../../app/history'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
jest.setTimeout(20000)
const mockRemove = jest.fn(); const mockGet = jest.fn(); const mockUpsert = jest.fn(); const mockList = jest.fn(); const mockPush = jest.fn()
let mockFocus = true; let mockParams: Record<string, any> = {}; let mockUser = { _id: 'a'.repeat(24), tenantId: 'own-tenant' }
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ mode: 'orders', label: 'заказ', labelCapitalized: 'Заказ', pluralCapitalized: 'Заказы' }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ removeCachedEntity: (...args: any[]) => mockRemove(...args), upsertEntities: (...args: any[]) => mockUpsert(...args), listCachedEntities: (...args: any[]) => mockList(...args) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
const row = (id = '1', patch: Record<string, any> = {}) => ({ id, entityType: 'event', entityId: 'c'.repeat(24), operation: 'update', entityLabel: `Мероприятие: Работа ${id}`, summary: `Изменение ${id}`, changes: [{ field: 'status', label: 'Статус', oldValue: 'draft', newValue: 'active' }], actorId: 'actor1', actorLabel: 'Анна', source: 'file_import', occurredAt: '2026-10-01T12:00:00Z', entityExists: true, ...patch })
const page = (data = [row()], nextCursor: string | null = null) => ({ success: true, data, meta: { hasMore: Boolean(nextCursor), nextCursor } })
function deferred() { let resolve!: (value: any) => void; let reject!: (value: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}><HistoryScreen /></ThemeProvider>
beforeEach(() => { jest.resetAllMocks(); mockFocus = true; mockParams = {}; mockUser = { _id: 'a'.repeat(24), tenantId: 'own-tenant' }; (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true }); mockGet.mockResolvedValue(page()); mockList.mockResolvedValue([]); mockUpsert.mockResolvedValue(undefined) })
const expand = (screen: ReturnType<typeof render>, id = '1') => fireEvent.press(screen.getByLabelText(`Изменения: Заказ: Работа ${id}`))
it.each(['light', 'dark'] as const)('история %s, diff и compact filters на токенах темы', async (mode) => {
  const screen = render(draw(mode)); const title = await screen.findByText('Изменение 1')
  expect(StyleSheet.flatten(title.props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).cardTitle)
  expand(screen); expect(screen.getByText('Было: Заявка')).toBeTruthy(); expect(screen.getByText('Стало: Подтверждено')).toBeTruthy()
  fireEvent.press(screen.getByText('Фильтры')); fireEvent.press(screen.getByText('Источник: Все источники'))
  for (const label of ['Avito', 'VK', 'Телефония', 'Импорт из файла']) expect(screen.getByText(label)).toBeTruthy()
  fireEvent.press(screen.getByText('Avito')); await waitFor(() => expect(mockGet.mock.calls.some(([path]) => path.includes('source=avito'))).toBe(true))
})
it('create не использует stale semantic action и не показывает старое значение', async () => {
  mockGet.mockResolvedValue(page([row('1', { operation: 'create', semanticAction: 'task_completed' })])); const screen = render(draw()); await screen.findByText('Создан заказ'); expand(screen)
  expect(screen.queryByText('Было: Заявка')).toBeNull(); expect(screen.getByText('Подтверждено')).toBeTruthy(); expect(screen.queryByText('Выполнена задача')).toBeNull()
})
it('пустые/loading/сеть/retry/invalid DTO и безопасные ошибки', async () => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw()); expect(screen.getByLabelText('Загрузка истории')).toBeTruthy(); expect(screen.queryByText('История пока пуста')).toBeNull()
  await act(async () => pending.reject(new Error('SECRET PII'))); await screen.findByText(/Не удалось загрузить историю/); expect(screen.queryByText('SECRET PII')).toBeNull()
  mockGet.mockResolvedValueOnce({ success: false, data: [] }); fireEvent.press(screen.getByText('Повторить загрузку')); await screen.findByText(/Не удалось загрузить историю/)
  mockGet.mockResolvedValueOnce(page([])); fireEvent.press(screen.getByText('Повторить загрузку')); await screen.findByText('История пока пуста')
})
it('403 не выдаёт cache за offline success и не оставляет карточки', async () => {
  mockList.mockResolvedValue([row()]); mockGet.mockRejectedValue({ status: 403 }); const screen = render(draw()); await screen.findByText(/Нет доступа к разделу/)
  expect(mockList).not.toHaveBeenCalled(); expect(screen.queryByText('Изменение 1')).toBeNull(); expect(screen.queryByText(/последняя сохранённая/)).toBeNull(); expect(mockPush).not.toHaveBeenCalled()
})
it('offline cache имеет честную подпись, навигация запрещена', async () => {
  ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false }); mockList.mockResolvedValue([row()]); const screen = render(draw()); await screen.findByText('Изменение 1'); expect(screen.getByText(/неполная офлайн-копия/)).toBeTruthy(); expand(screen); fireEvent.press(screen.getByText('Открыть карточку')); expect(mockGet).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
})
it('cache error/offline не оставляет вечную загрузку', async () => {
  ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false }); mockList.mockRejectedValue(new Error('SQL')); const screen = render(draw()); await screen.findByText(/Не удалось прочитать историю/); expect(screen.queryByLabelText('Загрузка истории')).toBeNull()
})
it('NetInfo ошибка пробует сервер, write cache ошибка обозначается без потери server result', async () => {
  ;(NetInfo.fetch as jest.Mock).mockRejectedValue(new Error('netinfo')); mockUpsert.mockRejectedValue(new Error('SQL')); const screen = render(draw()); await screen.findByText('Изменение 1'); expect(screen.getByText(/не сохранена для офлайн/)).toBeTruthy(); expect(screen.queryByLabelText('Загрузка истории')).toBeNull()
})
it('пагинация dedup, single-flight и retry страницы сохраняют список', async () => {
  mockGet.mockResolvedValueOnce(page([row()], 'cursor1')); const screen = render(draw()); await screen.findByText('Изменение 1')
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Показать ещё')); fireEvent.press(screen.getByText('Показать ещё')); expect(mockGet).toHaveBeenCalledTimes(2)
  await act(async () => pending.reject(new Error('network'))); expect(screen.getByText('Изменение 1')).toBeTruthy()
  mockGet.mockResolvedValueOnce(page([row(), row('2'), row('2')])); fireEvent.press(screen.getByText('Повторить загрузку страницы')); await screen.findByText('Изменение 2'); expect(screen.getAllByText('Изменение 1')).toHaveLength(1); expect(screen.getAllByText('Изменение 2')).toHaveLength(1)
  expect(mockGet.mock.calls[1][0]).toContain('cursor=cursor1'); expect(mockGet.mock.calls[2][0]).toContain('cursor=cursor1')
})
it('смена фильтра во время loadMore не смешивает список и cache', async () => {
  mockGet.mockResolvedValueOnce(page([row()], 'cursor1')); const screen = render(draw()); await screen.findByText('Изменение 1')
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Показать ещё'))
  mockGet.mockResolvedValueOnce(page([row('new')])); fireEvent.changeText(screen.getByLabelText('Поиск'), 'новый'); await screen.findByText('Изменение new')
  mockUpsert.mockClear(); await act(async () => pending.resolve(page([row('late')]))); expect(screen.queryByText('Изменение late')).toBeNull(); expect(mockUpsert).not.toHaveBeenCalled()
})
it('reload во время loadMore не даёт поздних карточек', async () => {
  mockGet.mockResolvedValueOnce(page([row()], 'cursor1')); const screen = render(draw()); await screen.findByText('Изменение 1')
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Показать ещё')); mockGet.mockResolvedValueOnce(page([row('fresh')])); fireEvent.press(screen.getByText('Обновить историю')); await screen.findByText('Изменение fresh')
  await act(async () => pending.resolve(page([row('late')]))); expect(screen.queryByText('Изменение late')).toBeNull()
})
it('403 на следующей странице очищает список и не читает offline cache', async () => {
  mockGet.mockResolvedValueOnce(page([row()], 'cursor1')); const screen = render(draw()); await screen.findByText('Изменение 1'); mockGet.mockRejectedValueOnce({ status: 403 }); fireEvent.press(screen.getByText('Показать ещё')); await screen.findByText(/Нет доступа/); expect(screen.queryByText('Изменение 1')).toBeNull(); expect(mockList).not.toHaveBeenCalled()
})
it('fixed route синхронизирован при смене params; invalid params не делают общий запрос', async () => {
  mockParams = { entityType: 'client', entityId: 'b'.repeat(24) }; const screen = render(draw()); await screen.findByText('Изменение 1'); expect(mockGet.mock.calls[0][0]).toContain(`entityType=client&entityId=${mockParams.entityId}`)
  mockParams = { entityType: 'event', entityId: 'd'.repeat(24) }; screen.rerender(draw()); await waitFor(() => expect(mockGet.mock.calls.length).toBe(2)); expect(mockGet.mock.calls[1][0]).toContain(`entityType=event&entityId=${mockParams.entityId}`)
  mockParams = { entityType: 'bad', entityId: 'd'.repeat(24) }; screen.rerender(draw()); expect(screen.getByText(/Некорректный адрес/)).toBeTruthy(); expect(mockGet).toHaveBeenCalledTimes(2)
})
it('invalid dates не запрашиваются, диапазон и local cached filter работают', async () => {
  ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false }); mockList.mockResolvedValue([row(), row('older', { occurredAt: '2026-09-01T00:00:00Z' })]); const screen = render(draw()); await screen.findByText('Изменение older'); fireEvent.press(screen.getByText('Фильтры')); fireEvent.changeText(screen.getByLabelText('С даты'), '2026-02-31')
  expect(screen.getByText(/существующую дату/)).toBeTruthy(); expect(screen.queryByText('Изменение older')).toBeNull()
  fireEvent.changeText(screen.getByLabelText('С даты'), '2026-10-01'); await screen.findByText('Изменение 1'); expect(screen.queryByText('Изменение older')).toBeNull(); expect(mockGet).not.toHaveBeenCalled()
})
it('смена user/tenant и blur игнорируют поздние запросы до cache', async () => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw()); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  mockUser = { _id: 'b'.repeat(24), tenantId: 'other-tenant' }; mockGet.mockResolvedValueOnce(page([row('new')])); screen.rerender(draw()); await screen.findByText('Изменение new')
  mockUpsert.mockClear(); await act(async () => pending.resolve(page([row('old')]))); expect(screen.queryByText('Изменение old')).toBeNull(); expect(mockUpsert).not.toHaveBeenCalled()
  const late = deferred(); mockGet.mockReturnValueOnce(late.promise); fireEvent.press(screen.getByText('Обновить историю')); mockFocus = false; screen.rerender(draw()); await act(async () => late.resolve(page([row('late')]))); expect(screen.queryByText('Изменение late')).toBeNull(); screen.unmount()
})
it.each([null, { _id: 'd'.repeat(24) }])('cached entityExists true не позволяет missing/foreign detail', async (data) => {
  const screen = render(draw()); await screen.findByText('Изменение 1'); expand(screen); mockGet.mockResolvedValueOnce({ success: true, data }); fireEvent.press(screen.getByText('Открыть карточку')); await screen.findByText(/Карточка недоступна/); expect(mockPush).not.toHaveBeenCalled()
})
it('deleted 404 и повтор проверки, double nav guard', async () => {
  const screen = render(draw()); await screen.findByText('Изменение 1'); expand(screen); mockGet.mockRejectedValueOnce({ status: 404 }); fireEvent.press(screen.getByText('Открыть карточку')); await screen.findByText(/Карточка удалена/); expect(mockPush).not.toHaveBeenCalled()
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Открыть карточку')); fireEvent.press(screen.getByText('Открыть карточку')); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3))
  await act(async () => pending.resolve({ success: true, data: { _id: 'c'.repeat(24) } })); expect(mockPush).toHaveBeenCalledTimes(1); expect(mockPush).toHaveBeenCalledWith(`/events/${'c'.repeat(24)}`)
})
it('late entity proof после смены user не открывает маршрут', async () => {
  const screen = render(draw()); await screen.findByText('Изменение 1'); expand(screen); const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Открыть карточку')); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
  mockUser = { _id: 'b'.repeat(24), tenantId: 'another' }; screen.rerender(draw()); await act(async () => pending.resolve({ success: true, data: { _id: 'c'.repeat(24) } })); expect(mockPush).not.toHaveBeenCalled()
})

it('unmount при незавершённом запросе не записывает позднюю историю в cache', async () => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw()); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1)); screen.unmount()
  await act(async () => pending.resolve(page([row('late')]))); expect(mockUpsert).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
})
