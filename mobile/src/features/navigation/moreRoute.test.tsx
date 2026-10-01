import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import MoreSectionScreen from '../../../app/more/[section]'

let mockSection: unknown = 'unknown'
const mockReplace = jest.fn()
const mockLists = jest.fn(() => null)
const mockApi = jest.fn()
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockReplace(href); return null },
  router: { replace: (path: string) => mockReplace(path) },
  useLocalSearchParams: () => ({ section: mockSection }),
}))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockApi(...args) } }))
jest.mock('../services/ServicesSection', () => ({ ServicesSection: () => null }))
jest.mock('../lists/ListsSection', () => ({ ListsSection: () => mockLists() }))
jest.mock('../integrations/IntegrationsSection', () => ({ IntegrationsSection: () => null }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: jest.fn() }))
jest.mock('../../shared/storage/encryptedFiles', () => ({}))
jest.mock('../../shared/sync/syncEngine', () => ({}))
jest.mock('../../shared/notifications/useExpoPushNotifications', () => ({}))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({}))

beforeEach(() => jest.clearAllMocks())
it.each(['phone-auth', 'billing-operations', 'service-analytics', 'unknown', 'users', 'tariffs', 'ai', 'constructor', '__proto__', ['lists']])('прямой адрес %s недоступен и не монтирует Списки', (section) => {
  mockSection = section
  const screen = render(<MoreSectionScreen />)
  expect(screen.getAllByText('Раздел недоступен').length).toBeGreaterThan(0)
  expect(mockLists).not.toHaveBeenCalled()
  expect(mockApi).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Открыть меню'))
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/more')
})
it('импорт/экспорт обозначает текущий пробел, не выдавая чужой экран за реализацию', () => {
  mockSection = 'import'
  const screen = render(<MoreSectionScreen />)
  expect(screen.getByText('Пока недоступно в приложении')).toBeTruthy()
  expect(mockLists).not.toHaveBeenCalled()
  expect(mockApi).not.toHaveBeenCalled()
})

it.each(['learning', 'client-reviews'])('новый раздел %s сообщает о незавершённом этапе без API-запросов', (section) => {
  mockSection = section
  const screen = render(<MoreSectionScreen />)
  expect(screen.getByText('Пока недоступно в приложении')).toBeTruthy()
  expect(mockLists).not.toHaveBeenCalled()
  expect(mockApi).not.toHaveBeenCalled()
})

it.each([['profile', '/(tabs)/profile'], ['billing-history', '/billing']])('личный alias %s ведёт в существующий экран', (section, path) => {
  mockSection = section
  render(<MoreSectionScreen />)
  expect(mockReplace).toHaveBeenCalledWith(path)
  expect(mockApi).not.toHaveBeenCalled()
})
