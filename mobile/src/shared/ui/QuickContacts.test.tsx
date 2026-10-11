import React from 'react'
import { Alert, Linking, View } from 'react-native'
import { act, fireEvent, render, within } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'
import { QuickContacts, getQuickContactActions } from './QuickContacts'
import { ThemeProvider } from './ThemeProvider'
import { lightPalette, darkPalette } from './theme'
import { normalizeMaxContactInput } from '../domain/maxContact'
import { confirmPhoneContact } from '../domain/phoneContactConfirmation'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon', FontAwesome5: 'BrandIcon' }))
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
  expect(screen.getByText('MAX')).toHaveStyle({ backgroundColor: palette.contacts.trialBadge, color: palette.contacts.onTrialBadge })
  screen.rerender(<ThemeProvider storage={null} forcedMode={mode}><QuickContacts client={{ ...client, max: '+79991234567' }} maxVisible={8} /></ThemeProvider>)
  expect(screen.getByText('MAX')).toHaveStyle({ backgroundColor: palette.contacts.max, color: palette.contacts.onBadge })
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

const allChannels = { ...client, whatsapp: client.phone, viber: client.phone, telegram: '@anna', max: 'https://max.ru/u/anna', vk: 'anna', instagram: 'anna', email: 'anna@example.test', preferredContactChannel: 'vk' as const }
it.each(['light', 'dark'] as const)('контакты %s: рамка PWA 32px, цель 40px, настоящие символы и приоритет', (mode) => {
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><QuickContacts client={allChannels} maxVisible={8} /></ThemeProvider>)
  const expected = mode === 'light'
    ? { backgroundColor: '#ffffff', borderColor: '#dedbd3' }
    : { backgroundColor: '#1c1610', borderColor: 'rgba(201,168,106,0.32)' }
  for (const [label, name, color] of [
    ['Позвонить', 'phone-alt', mode === 'light' ? '#15803d' : '#4ade80'],
    ['WhatsApp', 'whatsapp', '#16a34a'], ['Viber', 'viber', '#9333ea'],
    ['Telegram', 'telegram-plane', '#2563eb'], ['Instagram', 'instagram', '#a16207'],
    ['ВКонтакте — приоритетный канал связи', 'vk', '#2563eb'], ['Электронная почта', 'envelope', '#f87171'],
  ]) {
    const button = screen.getByLabelText(label)
    expect(button).toHaveStyle({ width: 40, height: 40 })
    expect(within(button).getByTestId('contact-button-face')).toHaveStyle({ width: 32, height: 32, borderWidth: 1, borderRadius: 8, ...expected })
    const icon = within(button).UNSAFE_getByType('BrandIcon' as any)
    expect(icon.props).toMatchObject({ name, color, size: 20 })
  }
  expect(within(screen.getByLabelText('ВКонтакте — приоритетный канал связи')).getByTestId('contact-button-face')).toHaveStyle({ borderBottomWidth: 3, borderBottomColor: mode === 'light' ? '#9a6b27' : '#c9a86a' })
  expect(screen.getByText('MAX')).toHaveStyle({ height: 20, minWidth: 20, fontSize: 7, color: '#ffffff' })
})
it.each(['light', 'dark'] as const)('пробный MAX %s — белый текст на красной плашке PWA', (mode) => {
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><QuickContacts client={client} maxVisible={8} /></ThemeProvider>)
  expect(screen.getByText('MAX')).toHaveStyle({ color: '#ffffff', backgroundColor: '#ef4444' })
})
it.each([320, 390, 414])('адаптивный ряд %s: все восемь каналов доступны, остаток нейтральный', (width) => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 })
  const screen = render(<QuickContacts client={allChannels} />)
  const buttons = screen.getAllByRole('button')
  expect(buttons.length).toBeGreaterThan(4)
  expect(buttons.length * 40).toBeLessThanOrEqual(width - 32)
  const overflow = screen.queryByLabelText('Все способы связи')
  if (overflow) {
    expect(within(overflow).UNSAFE_getByType('Icon' as any).props.color).toBe(lightPalette.cardMuted)
    fireEvent.press(overflow, { stopPropagation: jest.fn() })
    for (const action of getQuickContactActions(allChannels)) expect(screen.getAllByRole('button', { name: new RegExp('^' + action.label) }).length).toBeGreaterThan(0)
    fireEvent.press(screen.getByTestId('quick-actions-outside', { includeHiddenElements: true }))
    expect(screen.queryByText('Связаться с клиентом')).toBeNull()
  }
})
it('отказ контакта сохраняется один раз и инвалидирует клиентов; не знаю не сохраняет', async () => {
  const invalidateQueries = jest.fn(async () => undefined)
  const { QueryClientContext } = require('@tanstack/react-query')
  const screen = render(<QueryClientContext.Provider value={{ invalidateQueries }}><QuickContacts client={client} maxVisible={8} /></QueryClientContext.Provider>)
  await act(async () => fireEvent.press(screen.getByLabelText('WhatsApp — попробовать по телефону'), { stopPropagation: jest.fn() }))
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]
  await act(async () => { const no = buttons?.find(button => button.text === 'Нет')?.onPress; no?.(); no?.() })
  expect(confirmPhoneContact).toHaveBeenCalledTimes(1)
  expect(confirmPhoneContact).toHaveBeenCalledWith(client, 'whatsapp', client.phone, false)
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['cached-entities', 'clients'] })
  await act(async () => fireEvent.press(screen.getByLabelText('Telegram — попробовать по телефону'), { stopPropagation: jest.fn() }))
  expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button => button.text === 'Не знаю')?.style).toBe('cancel')
  expect(confirmPhoneContact).toHaveBeenCalledTimes(1)
})

it('вложенная узкая область ограничивает ряд, раскрытие сохраняет все каналы', () => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 800, scale: 1, fontScale: 1 })
  const screen = render(<QuickContacts client={allChannels} maxVisible={8} />)
  const row = screen.UNSAFE_getByType(QuickContacts).findAllByType(View)[0]
  fireEvent(row, 'layout', { nativeEvent: { layout: { width: 240, height: 40, x: 0, y: 0 } } })
  expect(screen.getAllByRole('button').length).toBeLessThanOrEqual(6)
  fireEvent.press(screen.getByLabelText('Все способы связи'), { stopPropagation: jest.fn() })
  expect(screen.getByText('Электронная почта')).toBeTruthy()
  expect(screen.getByText('ВКонтакте — приоритетный канал связи')).toBeTruthy()
})
