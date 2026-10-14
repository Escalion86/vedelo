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
it('раскрытие фильтров сохраняет применённый поиск, страницы и cursor без повторного запроса', async () => {
  mockGet.mockResolvedValueOnce(page([row()], 'cursor1'))
  const screen = render(draw()); await screen.findByText('Изменение 1')
  mockGet.mockResolvedValueOnce(page([row('found')], 'search-cursor'))
  fireEvent.changeText(screen.getByLabelText('Поиск'), 'работа'); await screen.findByText('Изменение found')
  mockGet.mockResolvedValueOnce(page([row('second')], 'next-cursor'))
  fireEvent.press(screen.getByText('Показать ещё')); await screen.findByText('Изменение second')
  expect(mockGet.mock.calls.at(-1)?.[0]).toContain('cursor=search-cursor')
  const calls=mockGet.mock.calls.length
  fireEvent.press(screen.getByTestId('history-filter-toggle'))
  expect(screen.getByTestId('history-filter-scroll')).toBeTruthy()
  fireEvent.press(screen.getByTestId('history-filter-toggle'))
  expect(screen.queryByTestId('history-filter-scroll')).toBeNull()
  expect(screen.getByTestId('history-filter-summary')).toHaveTextContent('Поиск: работа')
  expect(screen.getByTestId('history-filter-count')).toHaveTextContent('1')
  expect(screen.getByText('Изменение found')).toBeTruthy();expect(screen.getByText('Изменение second')).toBeTruthy()
  expect(mockGet).toHaveBeenCalledTimes(calls)
  mockGet.mockResolvedValueOnce(page([row('third')]))
  fireEvent.press(screen.getByText('Показать ещё'));await screen.findByText('Изменение third')
  expect(mockGet.mock.calls.at(-1)?.[0]).toContain('cursor=next-cursor')
  expect(mockGet.mock.calls.at(-1)?.[0]).toContain('search=')
})
