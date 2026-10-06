import React from 'react'
import { Text } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { AppProviders } from '../providers/AppProviders'
import { useTheme, THEME_PREFERENCE_KEY } from './ThemeProvider'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))
jest.mock('../auth/AuthProvider', () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
const Demo = () => {
  const { palette, preference } = useTheme()
  return <Text testID="theme">{palette.mode}/{preference}</Text>
}
it('настоящий AppProviders восстанавливает тёмную тему без forcedMode', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
  const screen = render(<AppProviders><Demo /></AppProviders>)
  await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark/dark'))
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(THEME_PREFERENCE_KEY)
})
it('AppProviders восстанавливает system, который следует системной теме', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('system')
  const native = require('react-native'), scheme = jest.spyOn(native, 'useColorScheme').mockReturnValue('dark')
  try {
    const screen = render(<AppProviders><Demo /></AppProviders>)
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark/system'))
    scheme.mockReturnValue('light'); screen.rerender(<AppProviders><Demo /></AppProviders>)
    expect(screen.getByTestId('theme')).toHaveTextContent('light/system')
  } finally { scheme.mockRestore() }
})
