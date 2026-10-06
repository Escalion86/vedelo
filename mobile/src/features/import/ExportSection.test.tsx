import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import ExportRoute from '../../../app/more/export'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { exportDeferred, exportFixture, exportTerms } from './exportFixtures'
const mockLoad = jest.fn(), mockShare = jest.fn(), mockOnline = jest.fn(), mockPush = jest.fn()
let mockUser: any = { _id: 'a', tenantId: 'ta' }, mockFocus = true
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (callback: any) => require('react').useEffect(() => mockFocus ? callback() : undefined, [callback, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => require('./exportFixtures').exportTerms }))
jest.mock('./exportApi', () => ({ loadExportData: (...args: any[]) => mockLoad(...args) }))
jest.mock('./exportNative', () => ({ shareExportCsv: (...args: any[]) => mockShare(...args) }))
jest.mock('@react-native-community/netinfo', () => ({ fetch: () => mockOnline() }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}><ExportRoute /></ThemeProvider>
beforeEach(() => { jest.clearAllMocks(); mockUser = { _id: 'a', tenantId: 'ta' }; mockFocus = true; mockLoad.mockResolvedValue(exportFixture()); mockShare.mockResolvedValue({ opened: true, error: false, cleanupFailed: false }); mockOnline.mockResolvedValue({ isConnected: true, isInternetReachable: true }); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined) })
afterEach(() => jest.restoreAllMocks())
it.each(['light', 'dark'] as const)('экран %s/theme, три набора, counts, single share', async mode => {
  const screen = render(draw(mode)); await screen.findByText('☑ Заявки (draft) · 1')
  expect(StyleSheet.flatten(screen.getByText('Экспорт').props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  fireEvent.press(screen.getByLabelText('Заявки (draft)')); fireEvent.press(screen.getByLabelText('Транзакции')); fireEvent.press(screen.getByText('Экспортировать выбранные CSV'))
  await screen.findByText(/Окна передачи: 1 из 1/); expect(mockShare.mock.calls[0][0]).toBe('events'); expect(mockShare.mock.calls[0][1]).toContain('\ufeffID;Дата начала'); screen.unmount()
})
it('loading не empty; 403/no-network/retry', async () => {
  const wait = exportDeferred<any>(); mockLoad.mockReturnValueOnce(wait.promise); const screen = render(draw())
  expect(screen.getByLabelText('Загружаем полный серверный набор')).toBeTruthy(); expect(screen.queryByText('Выбранные наборы пусты')).toBeNull()
  await act(async () => wait.reject({ status: 403, message: 'SECRET' })); expect(screen.getByText(/Экспорт недоступен/)).toBeTruthy(); expect(screen.queryByText('SECRET')).toBeNull()
  fireEvent.press(screen.getByText('Выбрать тариф')); expect(mockPush).toHaveBeenCalledWith('/billing')
  fireEvent.press(screen.getByText('Экспортировать выбранные CSV')); expect(mockShare).not.toHaveBeenCalled()
  mockOnline.mockResolvedValue({ isConnected: false }); fireEvent.press(screen.getByText('Обновить данные для экспорта')); await screen.findByText(/Нет сети/)
  mockOnline.mockResolvedValue({ isConnected: true }); fireEvent.press(screen.getByText('Обновить данные для экспорта')); await screen.findByText('☑ Заявки (draft) · 1'); screen.unmount()
})
it('empty честный; missing поля видимы', async () => {
  mockLoad.mockResolvedValue({ events: [], clients: [], services: [], transactions: [] }); const screen = render(draw()); await screen.findByText('Выбранные наборы пусты')
  const data = exportFixture(); data.events[1] = { _id: 'request', status: 'draft' }; mockLoad.mockResolvedValue(data); fireEvent.press(screen.getByText('Обновить данные для экспорта')); await screen.findByText(/API не передал часть полей: Дата заявки, Телефон, Услуги/); screen.unmount()
})
it('все deselected блокируют экспорт', async () => {
  const screen = render(draw()); await screen.findByText('☑ Заявки (draft) · 1'); for (const label of [exportTerms.pluralCapitalized + ' (без заявок)', 'Заявки (draft)', 'Транзакции']) fireEvent.press(screen.getByLabelText(label))
  fireEvent.press(screen.getByText('Экспортировать выбранные CSV')); expect(mockShare).not.toHaveBeenCalled(); screen.unmount()
})
it('следующий файл требует подтверждения; stop / cleanup warning', async () => {
  const screen = render(draw()); await screen.findByText('☑ Заявки (draft) · 1'); fireEvent.press(screen.getByText('Экспортировать выбранные CSV'))
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled()); await act(async () => (Alert.alert as jest.Mock).mock.calls.at(-1)[2][0].onPress())
  await screen.findByText(/Окна передачи: 1 из 3/); expect(mockShare).toHaveBeenCalledTimes(1)
  mockShare.mockResolvedValue({ opened: false, error: true, cleanupFailed: true }); fireEvent.press(screen.getByText('Экспортировать выбранные CSV')); await screen.findByText(/Физическая очистка не подтверждена/); expect(screen.getByText(/Не удалось открыть передачу/)).toBeTruthy(); screen.unmount()
})
it('blur и смена пользователя исключают late read прежнего tenant', async () => {
  const old = exportDeferred<any>(); mockLoad.mockReturnValueOnce(old.promise); const screen = render(draw()); await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1))
  mockFocus = false; screen.rerender(draw()); mockUser = { _id: 'b', tenantId: 'tb' }; mockFocus = true; mockLoad.mockResolvedValue({ events: [], clients: [], services: [], transactions: [] }); screen.rerender(draw()); await screen.findByText('Выбранные наборы пусты'); await act(async () => old.resolve(exportFixture()))
  expect(screen.queryByText('☑ Заявки (draft) · 1')).toBeNull(); expect(mockShare).not.toHaveBeenCalled(); screen.unmount()
})
it('unmount во время свежего чтения не открывает native передачу', async () => {
  const screen = render(draw()); await screen.findByText('☑ Заявки (draft) · 1'); const late = exportDeferred<any>(); mockLoad.mockReturnValueOnce(late.promise); fireEvent.press(screen.getByText('Экспортировать выбранные CSV')); await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2)); screen.unmount(); await act(async () => late.resolve(exportFixture())); expect(mockShare).not.toHaveBeenCalled()
})
it('unauthorized не читает данные', () => { mockUser = null; const screen = render(draw()); expect(screen.getByText('Войдите в аккаунт для экспорта.')).toBeTruthy(); expect(mockLoad).not.toHaveBeenCalled(); screen.unmount() })
