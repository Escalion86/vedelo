import React from 'react'
import { Alert, Linking } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'
import { QuickContacts, getQuickContactActions } from './QuickContacts'
import { ThemeProvider } from './ThemeProvider'
import { lightPalette, darkPalette } from './theme'
import { normalizeMaxContactInput } from '../domain/maxContact'
import { confirmPhoneContact } from '../domain/phoneContactConfirmation'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('../domain/phoneContactConfirmation', () => ({ confirmPhoneContact: jest.fn(async () => ({ max: '+79991234567', maxPhoneUnavailable: false })) }))
const client = { _id: 'local-client', phone: '79991234567' }
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
})
afterEach(() => jest.restoreAllMocks())
it('явный контакт приоритетнее флага unavailable; скрываются только пробные каналы', () => {
  expect(getQuickContactActions(client).filter((action) => action.trial).map((action) => action.provider)).toEqual(['whatsapp', 'telegram', 'max'])
  const hidden = { ...client, whatsappPhoneUnavailable: true, telegramPhoneUnavailable: true, maxPhoneUnavailable: true }
  expect(getQuickContactActions(hidden).map((action) => action.label)).toEqual(['Позвонить'])
  const actions = getQuickContactActions({ ...hidden, max: 'https://max.ru/u/anna', telegramPhone: '79990000000', whatsapp: '79991111111' })
  expect(actions.filter((action) => action.trial)).toHaveLength(0)
  expect(actions.find((action) => action.provider === 'telegram')?.url).toBe('tg://resolve?phone=79990000000')
  expect(actions.find((action) => action.provider === 'max')?.url).toBe('https://max.ru/u/anna')
})
it.each([['8 (999) 123-45-67', '+79991234567'], ['9991234567', '+79991234567'], ['max.ru/u/anna', 'https://max.ru/u/anna'], ['https://evil.test/anna', ''], ['https://max.ru/', '']])('нормализация MAX %s', (input, expected) => {
  expect(normalizeMaxContactInput(input)).toBe(expected)
})
it.each(['light', 'dark'] as const)('MAX: пробный красный, подтверждённый фирменный, тема %s', (mode) => {
  const palette = mode === 'light' ? lightPalette : darkPalette
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><QuickContacts client={client} maxVisible={8} /></ThemeProvider>)
  expect(screen.getByText('MAX')).toHaveStyle({ backgroundColor: palette.contacts.trial, color: palette.contacts.onBadge })
  screen.rerender(<ThemeProvider storage={null} forcedMode={mode}><QuickContacts client={{ ...client, max: '+79991234567' }} maxVisible={8} /></ThemeProvider>)
  expect(screen.getByText('MAX')).toHaveStyle({ backgroundColor: palette.contacts.max })
})
it('MAX копирует нормализованный номер, открывает приложение и подтверждает через существующую мутацию', async () => {
  const screen = render(<QuickContacts client={client} maxVisible={8} />)
  await act(async () => fireEvent.press(screen.getByLabelText('MAX — попробовать по телефону'), { stopPropagation: jest.fn() }))
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('+79991234567')
  expect(Linking.openURL).toHaveBeenCalledWith('max://max.ru/')
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]
  await act(async () => buttons?.find((button) => button.text === 'Да')?.onPress?.())
  expect(confirmPhoneContact).toHaveBeenCalledWith(client, 'max', '+79991234567', true)
})
it('ссылка MAX открывается без копирования и подтверждения', async () => {
  const screen = render(<QuickContacts client={{ ...client, max: 'https://max.ru/u/anna' }} maxVisible={8} />)
  await act(async () => fireEvent.press(screen.getByLabelText('MAX'), { stopPropagation: jest.fn() }))
  expect(Linking.openURL).toHaveBeenCalledWith('https://max.ru/u/anna')
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled()
  expect(confirmPhoneContact).not.toHaveBeenCalled()
})
it('отказ Clipboard не теряет номер и не блокирует открытие MAX', async () => {
  jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'))
  const screen = render(<QuickContacts client={{ ...client, max: '+79991234567' }} maxVisible={8} />)
  await act(async () => fireEvent.press(screen.getByLabelText('MAX'), { stopPropagation: jest.fn() }))
  expect(Linking.openURL).toHaveBeenCalledWith('max://max.ru/')
  expect(Alert.alert).toHaveBeenCalledWith('Номер не скопирован', expect.stringContaining('+79991234567'))
})
