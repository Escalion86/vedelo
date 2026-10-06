import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'
import * as SystemUI from 'expo-system-ui'
import { ThemeProvider } from './ThemeProvider'
import { ThemeSystemUI } from './ThemeSystemUI'
import { darkPalette, lightPalette } from './theme'

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }))
jest.mock('expo-status-bar', () => ({ StatusBar: (props: Record<string, unknown>) => {
  const { View } = require('react-native')
  return <View testID="statusbar" {...props} />
} }))
const write = jest.mocked(SystemUI.setBackgroundColorAsync)
const tree = (mode: 'light' | 'dark') => <ThemeProvider forcedMode={mode} storage={null}><ThemeSystemUI /></ThemeProvider>
beforeEach(() => { jest.clearAllMocks(); write.mockResolvedValue(undefined) })

it.each(['light', 'dark'] as const)('%s: значки и фон root согласованы без устаревших свойств StatusBar', async mode => {
  const screen = render(tree(mode))
  expect(screen.getByTestId('statusbar').props.style).toBe(mode === 'dark' ? 'light' : 'dark')
  expect(screen.getByTestId('statusbar').props.backgroundColor).toBeUndefined()
  expect(screen.getByTestId('statusbar').props.translucent).toBeUndefined()
  await waitFor(() => expect(write).toHaveBeenCalledWith(mode === 'dark' ? darkPalette.canvas : lightPalette.canvas))
})

it('поздний ответ не перезаписывает последний фон, промежуточный выбор пропускается', async () => {
  let finish!: () => void
  write.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const screen = render(tree('light'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  screen.rerender(tree('dark')); screen.rerender(tree('light')); screen.rerender(tree('dark'))
  expect(write).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('statusbar').props.style).toBe('light')
  await act(async () => finish())
  await waitFor(() => expect(write.mock.calls.map(([color]) => color)).toEqual([lightPalette.canvas, darkPalette.canvas]))
})

it('отказ native root не ломает значки и следующую смену темы', async () => {
  write.mockRejectedValueOnce(new Error('native unavailable'))
  const screen = render(tree('dark'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(screen.getByTestId('statusbar').props.style).toBe('light')
  screen.rerender(tree('light'))
  await waitFor(() => expect(write).toHaveBeenLastCalledWith(lightPalette.canvas))
})

it('размонтирование отменяет ещё не начатый native вызов; повторный mount ждёт прежний', async () => {
  let finish!: () => void
  write.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const screen = render(tree('dark'))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  screen.rerender(tree('light')); screen.unmount()
  const next = render(tree('dark'))
  await act(async () => finish())
  await waitFor(() => expect(write.mock.calls.map(([color]) => color)).toEqual([darkPalette.canvas, darkPalette.canvas]))
  next.unmount()
})
