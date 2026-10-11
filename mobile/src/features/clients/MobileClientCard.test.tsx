import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { MobileClientCard } from './MobileClientCard'
import { clientSummary } from './clientList'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon', FontAwesome5: 'BrandIcon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Мероприятия' }) }))
const client = { _id: 'local-a', firstName: 'Очень длинное имя клиента '.repeat(6).trim(), phone: '79991234567', whatsapp: '79991234567', telegram: '@anna', max: 'https://max.ru/u/anna', vk: 'anna', email: 'anna@example.test' }
beforeEach(() => jest.clearAllMocks())
afterEach(() => jest.restoreAllMocks())
it.each([320, 390, 414])('карточка клиента %s: без лимита двух контактов, доступный остаток и отдельный URL', async (width) => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 })
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  const screen = render(<ThemeProvider storage={null}><MobileClientCard client={client} summary={clientSummary(client._id, [])} onDelete={jest.fn()} /></ThemeProvider>)
  const footer = screen.getByTestId('client-contacts-local-a')
  expect(within(footer).getAllByRole('button').length).toBeGreaterThan(3)
  const overflow = screen.queryByLabelText('Все способы связи')
  if (overflow) fireEvent.press(overflow, { stopPropagation: jest.fn() })
  const vk = screen.queryByText('ВКонтакте') || screen.getByLabelText('ВКонтакте')
  await act(async () => fireEvent.press(vk, { stopPropagation: jest.fn() }))
  expect(Linking.openURL).toHaveBeenCalledWith('https://vk.com/anna')
  expect(router.push).not.toHaveBeenCalled()
  expect(screen.getByText(client.firstName).props.numberOfLines).toBe(1)
})

it.each(['light', 'dark'] as const)('клиент %s: имя первым, плотность и круг отключённых push как в PWA', (mode) => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 800, scale: 1, fontScale: 1 })
  const screen = render(<ThemeProvider forcedMode={mode} storage={null}><MobileClientCard client={{ ...client, firstName: 'Анна', secondName: 'Иванова', thirdName: 'Ивановна', messengerPushMuted: true }} summary={clientSummary(client._id, [{ _id: 'e', clientId: client._id, status: 'active', eventDate: '2099-01-01' }])} onDelete={jest.fn()} /></ThemeProvider>)
  expect(screen.getByText('Анна Иванова Ивановна')).toBeTruthy()
  expect(screen.getByTestId('client-shell-local-a')).toHaveStyle({ minHeight: 178, padding: 10.4 })
  expect(screen.getByLabelText('Push-уведомления отключены')).toHaveStyle({ width: 28, height: 28, borderRadius: 999, borderWidth: 1 })
  expect(screen.getByText('События 1')).toBeTruthy()
})
