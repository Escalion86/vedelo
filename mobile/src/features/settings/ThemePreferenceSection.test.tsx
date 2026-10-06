import React from 'react'
import { Text } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme, type ThemePreferenceStorage } from '../../shared/ui/ThemeProvider'
import { Button, CompactField, Surface } from '../../shared/ui/components'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { ThemePreferenceSection } from './ThemePreferenceSection'
import { SettingsSection } from './SettingsSection'

const mockGet = jest.fn(), mockPut = jest.fn(), mockCache = jest.fn()
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: jest.fn() }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args), put: (...args: unknown[]) => mockPut(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: (...args: unknown[]) => mockCache(...args), upsertEntities: jest.fn() }))
const Demo = () => {
  const { palette, preference } = useTheme()
  return <Surface testID="demo-surface"><Text testID="demo-mode">{palette.mode}/{preference}</Text><CompactField label="Проверка темы поля" value="Текст" /><Button title="Проверка темы кнопки" onPress={() => {}} /></Surface>
}
const draw = (storage: ThemePreferenceStorage, settings = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const screen = render(<QueryClientProvider client={client}><ThemeProvider storage={storage}>{settings ? <SettingsSection /> : <ThemePreferenceSection />}<Demo /></ThemeProvider></QueryClientProvider>)
  return { ...screen, client }
}
beforeEach(() => { jest.clearAllMocks(); mockGet.mockRejectedValue(new Error('offline')); mockCache.mockResolvedValue([]) })

it('смена темы сразу обновляет фон, поле и кнопку; успех появляется только после записи', async () => {
  let finish!: () => void
  const storage = { read: async () => null, write: jest.fn(() => new Promise<void>(resolve => { finish = resolve })) }
  const screen = draw(storage)
  fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }))
  expect(screen.getByRole('radio', { name: 'Тёмная' }).props.accessibilityState.checked).toBe(true)
  expect(screen.getByTestId('demo-mode')).toHaveTextContent('dark/dark')
  expect(screen.getByLabelText('Проверка темы поля')).toHaveStyle({ color: darkPalette.text, backgroundColor: darkPalette.surface })
  expect(screen.getByLabelText('Проверка темы поля').props.keyboardAppearance).toBe('dark')
  expect(screen.getByTestId('demo-surface')).toHaveStyle({ backgroundColor: darkPalette.surface })
  expect(screen.getByText('Проверка темы кнопки')).toHaveStyle({ color: darkPalette.onPrimary })
  expect(screen.queryByText('Тема сохранена на этом устройстве.')).toBeNull()
  expect(screen.getByText('Сохраняем тему на устройстве…')).toBeTruthy()
  await waitFor(() => expect(storage.write).toHaveBeenCalledWith('dark'))
  await act(async () => finish())
  expect(screen.getByText('Тема сохранена на этом устройстве.')).toBeTruthy()
  expect(mockGet).not.toHaveBeenCalled(); expect(mockPut).not.toHaveBeenCalled(); expect(mockCache).not.toHaveBeenCalled()
})

it('отказ записи оставляет выбранную тему без ложного успеха; явный повтор сохраняет её', async () => {
  const write = jest.fn().mockRejectedValueOnce(new Error('private secret')).mockResolvedValue(undefined)
  const screen = draw({ read: async () => null, write })
  fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }))
  const retry = await screen.findByRole('button', { name: 'Повторить сохранение темы' })
  expect(screen.getByTestId('demo-mode')).toHaveTextContent('dark/dark')
  expect(screen.queryByText('Тема сохранена на этом устройстве.')).toBeNull()
  expect(screen.queryByText(/private secret/)).toBeNull()
  fireEvent.press(retry)
  await screen.findByText('Тема сохранена на этом устройстве.')
  expect(write.mock.calls).toEqual([['dark'], ['dark']])
})

it('отказ чтения не блокирует radio и позволяет записать текущую тему', async () => {
  const write = jest.fn().mockResolvedValue(undefined)
  const screen = draw({ read: async () => { throw new Error('unavailable') }, write })
  fireEvent.press(await screen.findByRole('button', { name: 'Повторить сохранение темы' }))
  await screen.findByText('Тема сохранена на этом устройстве.')
  expect(write).toHaveBeenCalledWith('light')
  expect(screen.getByLabelText('Проверка темы поля')).toHaveStyle({ color: lightPalette.text })
})

it('поздняя hydration не отменяет пользовательский выбор, даже пока есть быстрые записи', async () => {
  let finishRead!: (value: string) => void, finishWrite!: () => void
  const storage = { read: () => new Promise<string>(resolve => { finishRead = resolve }),
    write: jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve })).mockResolvedValue(undefined) }
  const screen = draw(storage)
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText(/Читаем тему этого устройства/)).toBeTruthy()
  fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }))
  await waitFor(() => expect(storage.write).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByRole('radio', { name: 'Светлая' }))
  fireEvent.press(screen.getByRole('radio', { name: 'Как на устройстве' }))
  await act(async () => finishRead('dark'))
  expect(screen.getByRole('radio', { name: 'Как на устройстве' }).props.accessibilityState.checked).toBe(true)
  await act(async () => finishWrite())
  await screen.findByText('Тема сохранена на этом устройстве.')
  expect(storage.write.mock.calls.map(([value]) => value)).toEqual(['dark', 'light', 'system'])
})

it('настройка доступна при задержанном HTTP и после offline/ошибки терминологии без её PUT', async () => {
  let rejectHttp!: (reason: Error) => void
  mockGet.mockImplementation(() => new Promise((_, reject) => { rejectHttp = reject }))
  const write = jest.fn().mockResolvedValue(undefined)
  const screen = draw({ read: async () => null, write }, true)
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }))
  await screen.findByText('Тема сохранена на этом устройстве.')
  await act(async () => rejectHttp(new Error('offline')))
  expect(screen.getByRole('radio', { name: 'Заказы' }).props.accessibilityState.disabled).toBe(true)
  fireEvent.press(screen.getByRole('radio', { name: 'Светлая' }))
  await waitFor(() => expect(write).toHaveBeenLastCalledWith('light'))
  expect(screen.getByRole('radio', { name: 'Светлая' }).props.accessibilityState.checked).toBe(true)
  expect(mockPut).not.toHaveBeenCalled()
})

it('system реагирует на смену системной темы при сохранённом предпочтении', async () => {
  const native = require('react-native')
  const scheme = jest.spyOn(native, 'useColorScheme').mockReturnValue('dark')
  const storage = { read: async () => 'system', write: jest.fn().mockResolvedValue(undefined) }
  try {
    const screen = render(<ThemeProvider storage={storage}><ThemePreferenceSection /><Demo /></ThemeProvider>)
    await waitFor(() => expect(screen.getByTestId('demo-mode')).toHaveTextContent('dark/system'))
    scheme.mockReturnValue('light')
    screen.rerender(<ThemeProvider storage={storage}><ThemePreferenceSection /><Demo /></ThemeProvider>)
    expect(screen.getByTestId('demo-mode')).toHaveTextContent('light/system')
    expect(screen.getByRole('radio', { name: 'Как на устройстве' }).props.accessibilityState.checked).toBe(true)
    expect(storage.write).not.toHaveBeenCalled()
  } finally { scheme.mockRestore() }
})
