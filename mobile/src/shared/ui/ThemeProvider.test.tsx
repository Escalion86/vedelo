import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { THEME_PREFERENCE_KEY, ThemeProvider, useTheme, useThemeStyles, type ThemePreferenceStorage } from './ThemeProvider'
import { colors, type Palette } from './theme'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))
const createStyles = (palette: Palette) => StyleSheet.create({ text: { color: palette.primary } })
const Demo = () => {
  const theme = useTheme()
  const styles = useThemeStyles(createStyles)
  return <>
    <Text testID="palette" style={styles.text}>{theme.palette.mode}</Text>
    <Text testID="preference">{theme.preference}</Text>
    <Text testID="ready">{String(theme.hydrated)}</Text>
    <Text testID="error">{String(theme.persistenceError)}</Text>
    <Text testID="persistence">{theme.persistenceStatus}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Тёмная" onPress={() => void theme.setPreference('dark')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Светлая" onPress={() => void theme.setPreference('light')} />
  </>
}

beforeEach(() => jest.clearAllMocks())

it('без провайдера использует светлый fallback', () => {
  const screen = render(<Demo />)
  expect(screen.getByTestId('palette')).toHaveTextContent('light')
})

it('перестраивает стили и сохраняет preference вне SQLCipher', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue()
  const screen = render(<ThemeProvider><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith(THEME_PREFERENCE_KEY, 'dark'))
  expect(screen.getByTestId('palette')).toHaveStyle({ color: '#c9a86a' })
  expect(colors.primary).toBe('#725B2F')
  screen.unmount()
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
  const restored = render(<ThemeProvider><Demo /></ThemeProvider>)
  await waitFor(() => expect(restored.getByTestId('palette')).toHaveTextContent('dark'))
})

it('изолированный forcedMode сохраняется для preview и тестов', async () => {
  const storage = { read: jest.fn().mockResolvedValue('dark'), write: jest.fn().mockResolvedValue(undefined) }
  const screen = render(<ThemeProvider forcedMode="light" storage={storage}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('dark'))
  expect(screen.getByTestId('palette')).toHaveTextContent('light')
})

it.each(['broken', null])('невалидная preference %s даёт светлый fallback', async (value) => {
  const screen = render(<ThemeProvider storage={{ read: async () => value, write: async () => {} }}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  expect(screen.getByTestId('palette')).toHaveTextContent('light')
})

it('позднее чтение не отменяет уже сделанный выбор', async () => {
  let resolveRead!: (value: string) => void
  const storage = { read: () => new Promise<string>((resolve) => { resolveRead = resolve }), write: jest.fn().mockResolvedValue(undefined) }
  const screen = render(<ThemeProvider storage={storage}><Demo /></ThemeProvider>)
  await act(async () => { await Promise.resolve() })
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await act(async () => resolveRead('light'))
  expect(screen.getByTestId('palette')).toHaveTextContent('dark')
})

it('ошибки preference безопасны, последующие записи восстанавливаются', async () => {
  const write = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined)
  const storage: ThemePreferenceStorage = { read: async () => { throw new Error('unavailable') }, write }
  const screen = render(<ThemeProvider storage={storage}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('true'))
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByLabelText('Светлая'))
  await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('false'))
})

it('сериализует записи: последний выбор сохраняется последним', async () => {
  let finishFirst!: () => void
  const write = jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
    .mockResolvedValue(undefined)
  const screen = render(<ThemeProvider storage={{ read: async () => null, write }}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByLabelText('Светлая'))
  expect(write).toHaveBeenCalledTimes(1)
  await act(async () => finishFirst())
  expect(write.mock.calls.map(([value]) => value)).toEqual(['dark', 'light'])
})

it('system следует системной теме, отсутствие системного значения даёт light', async () => {
  const native = require('react-native')
  const scheme = jest.spyOn(native, 'useColorScheme').mockReturnValue('dark')
  try {
    const screen = render(<ThemeProvider storage={null} initialPreference="system"><Demo /></ThemeProvider>)
    expect(screen.getByTestId('palette')).toHaveTextContent('dark')
    scheme.mockReturnValue('light')
    screen.rerender(<ThemeProvider storage={null} initialPreference="system"><Demo /></ThemeProvider>)
    expect(screen.getByTestId('palette')).toHaveTextContent('light')
    scheme.mockReturnValue(null)
    screen.rerender(<ThemeProvider storage={null} initialPreference="system"><Demo /></ThemeProvider>)
    expect(screen.getByTestId('palette')).toHaveTextContent('light')
  } finally {
    scheme.mockRestore()
  }
})

it('состояние сохранения ждёт SecureStore, поздний отказ чтения не отменяет успех выбора', async () => {
  let rejectRead!: (reason: Error) => void, finishWrite!: () => void
  const storage = { read: () => new Promise<string>((_, reject) => { rejectRead = reject }),
    write: () => new Promise<void>(resolve => { finishWrite = resolve }) }
  const screen = render(<ThemeProvider storage={storage}><Demo /></ThemeProvider>)
  await act(async () => { await Promise.resolve() })
  fireEvent.press(screen.getByLabelText('Тёмная'))
  expect(screen.getByTestId('persistence')).toHaveTextContent('saving')
  expect(screen.getByTestId('palette')).toHaveTextContent('dark')
  await act(async () => { await Promise.resolve() })
  await act(async () => finishWrite())
  expect(screen.getByTestId('persistence')).toHaveTextContent('saved')
  await act(async () => rejectRead(new Error('read unavailable')))
  expect(screen.getByTestId('persistence')).toHaveTextContent('saved')
  expect(screen.getByTestId('ready')).toHaveTextContent('true')
})

it('отказ ранней записи не выдаёт ошибку последнему выбору, последний отказ можно повторить', async () => {
  let rejectFirst!: (reason: Error) => void
  const write = jest.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject }))
    .mockRejectedValueOnce(new Error('write unavailable')).mockResolvedValue(undefined)
  const screen = render(<ThemeProvider storage={{ read: async () => null, write }}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByLabelText('Светлая'))
  await act(async () => rejectFirst(new Error('previous write unavailable')))
  await waitFor(() => expect(screen.getByTestId('persistence')).toHaveTextContent('error'))
  expect(screen.getByTestId('palette')).toHaveTextContent('light')
  fireEvent.press(screen.getByLabelText('Светлая'))
  await waitFor(() => expect(screen.getByTestId('persistence')).toHaveTextContent('saved'))
  expect(write.mock.calls.map(([value]) => value)).toEqual(['dark', 'light', 'light'])
})

it('синхронный отказ адаптера чтения обработан как ошибка; явная запись восстанавливает', async () => {
  const screen = render(<ThemeProvider storage={{ read: () => { throw new Error('unavailable') }, write: async () => {} }}><Demo /></ThemeProvider>)
  await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  expect(screen.getByTestId('persistence')).toHaveTextContent('error')
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(screen.getByTestId('persistence')).toHaveTextContent('saved'))
})

it('позднее чтение/запись после unmount не обновляет состояние; принятый выбор записывается', async () => {
  let finishRead!: (value: string) => void, finishWrite!: () => void
  const write = jest.fn(() => new Promise<void>(resolve => { finishWrite = resolve }))
  const screen = render(<ThemeProvider storage={{ read: () => new Promise<string>(resolve => { finishRead = resolve }), write }}><Demo /></ThemeProvider>)
  await act(async () => { await Promise.resolve() })
  fireEvent.press(screen.getByLabelText('Тёмная'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  screen.unmount()
  await act(async () => { finishRead('light'); finishWrite() })
  expect(write).toHaveBeenCalledWith('dark')
})
