import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import MoreScreen from '../../../app/(tabs)/more'

let mockRole = 'user'
const mockSummary = jest.fn()
const mockRefreshUser = jest.fn(() => Promise.resolve())
const mockRouterPush = jest.fn<void, [unknown]>()
const mockApiGet = jest.fn(() =>
  Promise.resolve({
    success: true as const,
    data: {
      account: {
        balance: 800,
        billingStatus: 'active',
        tariffActiveUntil: '2026-08-25T00:00:00.000Z',
        nextChargeAt: '2026-08-25T00:00:00.000Z',
        fundedMonths: 2,
        fundedUntil: '2026-10-25T00:00:00.000Z',
        unlimited: false,
      },
      currentTariff: {
        _id: 'tariff-id',
        title: 'DEV',
        price: 300,
        eventsPerMonth: 0,
        allowCalendarSync: true,
        allowStatistics: true,
        allowDocuments: true,
        allowTelephony: true,
        allowAi: true,
        allowAvitoIntegration: true,
        allowVkIntegration: true,
        allowPublicLeadApi: true,
      },
      tariffs: [],
    },
  })
)

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockRouterPush(href) },
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactModule = require('react') as typeof React
    ReactModule.useEffect(callback, [callback])
  },
}))

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: () => null,
}))

jest.mock('../../shared/api/client', () => ({
  api: { get: (path: string) => path === '/support-tickets/summary' ? mockSummary() : mockApiGet() },
}))

jest.mock('../../shared/auth/AuthProvider', () => ({
  useAuth: () => ({
    refreshUser: mockRefreshUser,
    user: {
      _id: 'user-id',
      tenantId: 'tenant-id',
      firstName: 'Анна',
      secondName: 'Иванова',
      phone: '79000000000',
      email: '',
      role: mockRole,
      tariffId: 'tariff-id',
      tariffTitle: 'Профи',
    },
  }),
}))

jest.mock('../../shared/auth/tokenStore', () => ({
  getAuthSession: async () => ({ user: { role: mockRole } }),
}))

describe('MoreScreen tariff card', () => {
  beforeEach(() => {
    mockRole = 'user'
    mockSummary.mockReset().mockResolvedValue({ success: true, data: { unreadCount: 7 } })
    mockRefreshUser.mockClear()
    mockRouterPush.mockClear()
    mockApiGet.mockClear()
  })

  it('разделяет профиль и тариф с прогнозом баланса', async () => {
    const screen = render(<MoreScreen />)

    expect(screen.getByText('Профиль, реквизиты, активность')).toBeTruthy()
    expect(screen.queryByText('79000000000')).toBeNull()

    await waitFor(() => {
      expect(screen.getByText('Тариф: DEV')).toBeTruthy()
      expect(screen.getByText(/хватит до 25\.10\.2026/)).toBeTruthy()
    })

    fireEvent.press(screen.getByTestId('more-change-tariff'))

    expect(mockRouterPush).toHaveBeenCalledWith('/billing')
  })
})


describe('MoreScreen support access', () => {
  beforeEach(() => {
    mockSummary.mockReset().mockResolvedValue({ success: true, data: { unreadCount: 7 } })
  })

  it('показывает собственный счётчик пользователю', async () => {
    mockRole = 'user'
    const screen = render(<MoreScreen />)
    await screen.findByText('7')
    expect(mockSummary).toHaveBeenCalledTimes(1)
  })

  it('не запрашивает глобальный счётчик для dev и сохраняет личный тариф', async () => {
    mockRole = 'dev'
    const screen = render(<MoreScreen />)
    await screen.findByText('Тариф: DEV')
    expect(mockSummary).not.toHaveBeenCalled()
    expect(screen.queryByText('7')).toBeNull()
    fireEvent.press(screen.getByText('Поддержка'))
    expect(screen.getByText('Обратная связь')).toBeTruthy()
  })

  it('убирает счётчик при смене роли и игнорирует запоздавший ответ', async () => {
    mockRole = 'user'
    let resolveSummary!: (value: unknown) => void
    mockSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve }))
    const screen = render(<MoreScreen />)
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(1))
    mockRole = 'dev'
    screen.rerender(<MoreScreen />)
    await act(async () => { resolveSummary({ data: { unreadCount: 42 } }) })
    expect(mockSummary).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('42')).toBeNull()
  })
})
