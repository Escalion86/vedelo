import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { MenuCatalogue, MenuSheet } from './MenuSheet'
import { badgeLabel, getMenuSection, isMenuRoute, menuGroups } from './menu'

let mockRole = 'user'
const mockGet = jest.fn()
const mockSummary = jest.fn()
const mockRefresh = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({
  user: { _id: 'user', tenantId: 'tenant', role: mockRole }, refreshUser: mockRefresh,
}) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (path: string) => mockGet(path) } }))
jest.mock('../support/api', () => ({ getSupportUnreadCount: () => mockSummary() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { currentTariff: { title: 'Профи' }, account: { balance: 0 } } })
  mockSummary.mockResolvedValue({ data: { unreadCount: 120 } })
})

it.each(['user', 'admin', 'dev'])('каталог роли %s одинаков, без admin-путей и глобального summary', async (role) => {
  mockRole = role
  const screen = render(<MenuSheet />)
  await act(async () => undefined)
  expect(screen.getAllByRole('button').map((item) => item.props.accessibilityLabel)).toEqual([
    'Профиль', 'Тариф: Профи', 'Синхронизация', 'История действий', 'Статистика',
    'Транзакции', 'Звонки', 'Настройки', 'Обратная связь',
  ])
  expect(mockGet).toHaveBeenCalledTimes(1)
  expect(mockGet).toHaveBeenCalledWith('/mobile/v1/billing')
  if (role === 'dev') expect(mockSummary).not.toHaveBeenCalled()
  else expect(screen.getByText('99+')).toBeTruthy()
  for (const section of ['users', 'tariffs', 'ai-settings', 'developer', 'unknown', '__proto__', 'constructor']) {
    expect(getMenuSection(section)).toBeUndefined()
  }
})

it('аккордеон закрыт, сохраняет точный порядок вложенных путей и закрывается повторным нажатием', () => {
  const navigate = jest.fn()
  const screen = render(<MenuCatalogue onNavigate={navigate} />)
  expect(screen.queryByText('Мои услуги')).toBeNull()
  const settings = screen.getByRole('button', { name: 'Настройки' })
  expect(settings.props.accessibilityState.expanded).toBe(false)
  fireEvent.press(settings)
  expect(screen.getAllByRole('button').map((item) => item.props.accessibilityLabel)).toEqual([
    'История действий', 'Статистика', 'Транзакции', 'Звонки', 'Настройки',
    'Общие настройки', 'Мои услуги', 'Интеграции', 'Импорт и экспорт', 'Документы',
    'Списки', 'Уведомления', 'Реферальная система', 'Обратная связь',
  ])
  fireEvent.press(screen.getByText('Мои услуги'))
  expect(navigate).toHaveBeenCalledWith('/more/services')
  expect(settings.props.accessibilityState.expanded).toBe(true)
  fireEvent.press(settings)
  expect(screen.queryByText('Мои услуги')).toBeNull()
})

it('пустая группа скрыта, одиночная сразу ведёт по адресу', () => {
  const navigate = jest.fn()
  const screen = render(<MenuCatalogue onNavigate={navigate} groups={[
    { title: 'Пустая', items: [] }, menuGroups[0],
  ]} />)
  expect(screen.queryByText('Пустая')).toBeNull()
  fireEvent.press(screen.getByText('История действий'))
  expect(navigate).toHaveBeenCalledWith('/history')
})

it('whitelist включает все пользовательские секции и только строковые точные значения', () => {
  for (const item of menuGroups.flatMap((group) => group.items)) {
    if (item.href.startsWith('/more/')) expect(getMenuSection(item.href.slice(6))).toEqual(item)
  }
  expect(getMenuSection(['settings'])).toBeUndefined()
  expect(getMenuSection(undefined)).toBeUndefined()
  expect(badgeLabel(99)).toBe('99')
  expect(badgeLabel(100)).toBe('99+')
  expect(isMenuRoute('/finance')).toBe(true)
  expect(isMenuRoute('/more/settings')).toBe(true)
  expect(isMenuRoute('/(tabs)/profile')).toBe(true)
  expect(isMenuRoute('/events')).toBe(false)
})
