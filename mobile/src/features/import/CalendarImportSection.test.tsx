import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { CalendarImportSection } from './CalendarImportSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { exportDeferred } from './exportFixtures'
const mockStatus = jest.fn(), mockCalendars = jest.fn(), mockPreview = jest.fn(), mockImport = jest.fn(), mockRead = jest.fn(), mockSave = jest.fn(), mockConnect = jest.fn(), mockSync = jest.fn()
let mockFocus = true, mockUser: any = { _id: 'a', tenantId: 'ta' }, mockEpoch = 0
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: (...args: any[]) => mockSync(...args) }))
jest.mock('./calendarImportApi', () => ({ calendarRange: () => ({ timeMin: '2026-01-01', timeMax: '2026-02-01' }), getCalendarImportStatus: () => mockStatus(), getImportCalendars: () => mockCalendars(), previewImportCalendar: (...a: any[]) => mockPreview(...a), importCalendarBatch: (...a: any[]) => mockImport(...a), connectImportCalendar: (...a: any[]) => mockConnect(...a) }))
jest.mock('./calendarImportStore', () => ({ readPendingCalendarImport: () => mockRead(), savePendingCalendarImport: (...a: any[]) => mockSave(...a) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-crypto', () => ({ randomUUID: () => '01234567-1234-1234-1234-123456789abc' }))
const status = { allowCalendarSync: true, allowAi: true, connected: true, calendarId: 'own', calendarName: 'Рабочий' }
const preview = { calendarId: 'own', calendarName: 'Рабочий', maxEvents: 100, batchSize: 10, quote: { billingMode: 'artistcrm', costPerEvent: 2, balance: 100, platformConfigured: true }, candidates: [{ id: 'google-1', title: 'Тестовая работа', eventDate: '2026-01-15', needsAi: true, alreadyImported: false, canceled: false }] }
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}><CalendarImportSection /></ThemeProvider>
const confirm = async () => { const calls = (Alert.alert as jest.Mock).mock.calls; await act(async () => calls.at(-1)[2].at(-1).onPress()) }
beforeEach(() => {
  jest.clearAllMocks(); mockFocus = true; mockUser = { _id: 'a', tenantId: 'ta' }; mockEpoch = 0
  mockStatus.mockResolvedValue(status); mockCalendars.mockResolvedValue([]); mockRead.mockResolvedValue(null); mockSave.mockResolvedValue(undefined); mockPreview.mockResolvedValue(preview); mockImport.mockResolvedValue({ results: [{ id: 'google-1', title: 'Тестовая работа', status: 'created' }], actualCost: 1.5 }); mockSync.mockResolvedValue(undefined)
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())
it.each(['light', 'dark'] as const)('preview and price are read without payment; %s import needs confirmation', async mode => {
  const screen = render(draw(mode)); fireEvent.press(await screen.findByText('Посмотреть события Google'))
  await screen.findByText(/оценка ИИ: 2.00/); expect(mockImport).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Импортировать выбранные события')); expect(mockImport).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
  await confirm(); await screen.findByText(/Заявка создана/)
  expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockImport.mock.invocationCallOrder[0]); expect(mockImport).toHaveBeenCalledTimes(1); expect(mockSave).toHaveBeenLastCalledWith(null, expect.any(Function)); screen.unmount()
})
it('lost response retains pending request and does not automatically retry', async () => {
  mockImport.mockRejectedValueOnce(new Error('SECRET'))
  const screen = render(draw()); fireEvent.press(await screen.findByText('Посмотреть события Google')); fireEvent.press(await screen.findByText('Импортировать выбранные события')); await confirm()
  await screen.findByText(/Действие не подтверждено/); expect(mockImport).toHaveBeenCalledTimes(1); expect(mockSave.mock.calls[0][0].groupId).toBeTruthy(); expect(mockSave).toHaveBeenCalledTimes(1); expect(screen.queryByText('SECRET')).toBeNull(); screen.unmount()
})
it('restored operation never starts before explicit confirmation', async () => {
  const pending = { _id: 'pending', groupId: 'saved-group', calendarId: 'own', timeMin: '2026-01-01', timeMax: '2026-02-01', eventIds: ['google-1'], preview }
  mockRead.mockResolvedValue(pending)
  const screen = render(draw()); await screen.findByText('Продолжить Google-импорт'); expect(mockImport).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Продолжить Google-импорт')); await confirm(); expect(mockImport.mock.calls[0][0].groupId).toBe('saved-group'); screen.unmount()
})
it('account change after confirmation cancels old mutation', async () => {
  const screen = render(draw()); fireEvent.press(await screen.findByText('Посмотреть события Google')); fireEvent.press(await screen.findByText('Импортировать выбранные события'))
  mockUser = { _id: 'b', tenantId: 'tb' }; mockEpoch++; screen.rerender(draw()); await confirm(); expect(mockImport).not.toHaveBeenCalled(); screen.unmount()
})
it('late preview after blur cannot publish or mutate', async () => {
  const wait = exportDeferred<any>(); mockPreview.mockReturnValueOnce(wait.promise)
  const screen = render(draw()); fireEvent.press(await screen.findByText('Посмотреть события Google')); await waitFor(() => expect(mockPreview).toHaveBeenCalled())
  mockFocus = false; screen.rerender(draw()); await act(async () => wait.resolve(preview)); expect(screen.queryByText('Импортировать выбранные события')).toBeNull(); expect(mockImport).not.toHaveBeenCalled(); screen.unmount()
})
it('changed calendar blocks resume before first POST', async () => {
  mockRead.mockResolvedValue({ _id: 'pending', groupId: 'saved', calendarId: 'different', eventIds: ['google-1'], preview })
  const screen = render(draw()); fireEvent.press(await screen.findByText('Продолжить Google-импорт')); await confirm(); await screen.findByText(/Действие не подтверждено/); expect(mockImport).not.toHaveBeenCalled(); screen.unmount()
})
