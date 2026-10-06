import React from 'react'
import { StyleSheet } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import OnboardingScreen from '../../../app/onboarding'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { api } from '../../shared/api/client'
import { upsertEntities } from '../../shared/storage/cache'
const mockRefresh = jest.fn(), mockComplete = jest.fn(), mockReplace = jest.fn()
const profile = { firstName: 'Иван', secondName: 'Иванов', thirdName: 'Иванович', whatsapp: '', telegram: '', vk: '', instagram: '' }
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { ...profile, _id: 'mock-user' }, refreshUser: mockRefresh, completeOnboarding: mockComplete }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn(), post: jest.fn() } }))
jest.mock('../../shared/storage/cache', () => ({ upsertEntities: jest.fn() }))
jest.mock('expo-router', () => ({ router: { replace: (path: string) => mockReplace(path) } }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
const presets = [
  { key: 'events', title: 'Мероприятия', description: 'Выступления и праздники', starterServices: [{ title: 'Выступление' }] },
  { key: 'repairs', title: 'Ремонт и очень длинное название серверной специализации', description: 'Серверные примеры', starterServices: [{ title: 'Диагностика' }, { title: 'Ремонт' }] },
]
const setup = (theme: 'light' | 'dark') => render(<ThemeProvider forcedMode={theme} storage={null}><OnboardingScreen /></ThemeProvider>)
const next = (screen: ReturnType<typeof render>) => fireEvent.press(screen.getByTestId('onboarding-next'))
beforeEach(() => {
  jest.clearAllMocks()
  ;(api.get as jest.Mock).mockResolvedValue({ success: true, data: { presets, servicesCount: 0, settings: { defaultTown: 'Москва', timeZone: 'Europe/Moscow' } } })
  ;(api.post as jest.Mock).mockResolvedValue({ success: true, data: { settings: { _id: 'settings' }, services: [{ _id: 'service' }], event: { _id: 'event' } } })
  ;(upsertEntities as jest.Mock).mockResolvedValue(undefined)
})
describe.each(['light', 'dark'] as const)('%s: мастер первого запуска', theme => {
  it('пять шагов, изменения/назад, серверные услуги, payload и прежний порядок кэша/auth', async () => {
    const screen = setup(theme), palette = theme === 'dark' ? darkPalette : lightPalette
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/mobile/v1/onboarding'))
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(1)
    expect(StyleSheet.flatten(screen.getByTestId('onboarding-first-name').props.style)).toMatchObject({ minHeight: 40, color: palette.text })
    fireEvent.changeText(screen.getByTestId('onboarding-first-name'), 'Пётр')
    fireEvent.changeText(screen.getByLabelText('WhatsApp'), '79990000000'); fireEvent.changeText(screen.getByLabelText('Telegram'), 'mockname')
    next(screen); expect(screen.getByText('Город и время')).toBeTruthy(); expect(screen.getByLabelText('Основной город').props.value).toBe('Москва')
    expect(screen.getByRole('radio', { name: 'Москва' }).props.accessibilityState.checked).toBe(true)
    fireEvent.changeText(screen.getByLabelText('Основной город'), 'Омск'); fireEvent.press(screen.getByRole('radio', { name: 'Омск' })); fireEvent.press(screen.getByRole('radio', { name: 'Тёмная' }))
    expect(screen.getByRole('radio', { name: 'Тёмная' }).props.accessibilityState.checked).toBe(true)
    fireEvent.press(screen.getByText('Назад')); expect(screen.getByTestId('onboarding-first-name').props.value).toBe('Пётр'); next(screen); next(screen)
    expect(screen.getByText('Специализация')).toBeTruthy(); fireEvent.press(screen.getByRole('radio', { name: presets[1].title })); expect(screen.getByText('Диагностика, Ремонт')).toBeTruthy()
    fireEvent.press(screen.getByRole('checkbox', { name: 'Создать стартовые услуги' })); expect(screen.getByRole('checkbox', { name: 'Создать стартовые услуги' }).props.accessibilityState.checked).toBe(false)
    fireEvent.press(screen.getByRole('checkbox', { name: 'Создать стартовые услуги' })); next(screen)
    expect(screen.getByText('Работа с коллегами')).toBeTruthy(); fireEvent.press(screen.getByRole('radio', { name: 'Да, бывает' })); next(screen)
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(5); expect(screen.getByText('Как устроена CRM')).toBeTruthy()
    expect(screen.getByText(/^Заявка\./)).toBeTruthy(); expect(screen.getByText(/^Подтверждено\./)).toBeTruthy(); expect(screen.getByText(/^Закрыто\./)).toBeTruthy(); expect(screen.getByText(/^Отменено\./)).toBeTruthy(); expect(screen.getByLabelText(/^Отменено\./).props.accessibilityRole).toBe('text')
    fireEvent.press(screen.getByRole('checkbox', { name: 'Создать учебную заявку' })); next(screen)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'))
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/onboarding', {
      profile: { ...profile, firstName: 'Пётр', whatsapp: '79990000000', telegram: 'mockname' }, town: 'Омск', timeZone: 'Asia/Omsk', theme: 'dark', presetKey: 'repairs', createStarterServices: true, showColleagueTransferFields: true, createDemoEvent: true,
    })
    expect((upsertEntities as jest.Mock).mock.calls).toEqual([['siteSettings', [{ _id: 'settings' }]], ['services', [{ _id: 'service' }]], ['events', [{ _id: 'event' }]]])
    expect(mockRefresh.mock.invocationCallOrder[0]).toBeGreaterThan((upsertEntities as jest.Mock).mock.invocationCallOrder[2]); expect(mockComplete.mock.invocationCallOrder[0]).toBeGreaterThan(mockRefresh.mock.invocationCallOrder[0])
  })
  it('существующие услуги не создаются повторно; defaults и пустой ответ не выдумывают записи', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({ success: true, data: { presets, servicesCount: 2 } })
    ;(api.post as jest.Mock).mockResolvedValue({ success: true, data: {} })
    const screen = setup(theme); await act(async () => {})
    next(screen); expect(screen.getByRole('radio', { name: 'Красноярск' }).props.accessibilityState.checked).toBe(true)
    next(screen); expect(screen.getByText(/У вас уже есть услуги/)).toBeTruthy(); expect(screen.queryByRole('checkbox', { name: 'Создать стартовые услуги' })).toBeNull()
    next(screen); next(screen); next(screen)
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/onboarding', { profile, town: '', timeZone: 'Asia/Krasnoyarsk', theme: 'light', presetKey: 'events', createStarterServices: false, showColleagueTransferFields: false, createDemoEvent: false })
    expect(upsertEntities).not.toHaveBeenCalled()
  })
  it('ошибка завершения сохраняет выбор, loading блокирует возврат/checkbox/повтор', async () => {
    let reject!: (reason: Error) => void
    ;(api.post as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const screen = setup(theme); await act(async () => {}); next(screen); next(screen); next(screen); next(screen)
    fireEvent.press(screen.getByRole('checkbox', { name: 'Создать учебную заявку' })); next(screen)
    expect(screen.getByRole('checkbox', { name: 'Создать учебную заявку' }).props.accessibilityState.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Назад' }).props.accessibilityState.disabled).toBe(true)
    next(screen); expect(api.post).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('Не удалось завершить настройку')))
    await screen.findByText('Не удалось завершить настройку'); expect(mockComplete).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Создать учебную заявку' }).props.accessibilityState.checked).toBe(true)
  })
  it('ошибка/отсутствие специализаций не выглядят как подтверждённые стартовые услуги', async () => {
    ;(api.get as jest.Mock).mockRejectedValueOnce(new Error('Не удалось загрузить мастер'))
    const screen = setup(theme); await screen.findByText('Не удалось загрузить мастер'); next(screen); next(screen)
    expect(screen.getByText(/Список и стартовые услуги ещё не подтверждены/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Создать стартовые услуги' })).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('незавершённое чтение и пустой серверный каталог не подтверждают услуги', async () => {
    let resolve!: (value: unknown) => void
    ;(api.get as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const screen = setup(theme); next(screen); next(screen)
    expect(screen.getByText(/Список и стартовые услуги ещё не подтверждены/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Создать стартовые услуги' })).toBeNull()
    await act(async () => resolve({ success: true, data: { presets: [], servicesCount: 0 } }))
    expect(screen.getByText(/Список и стартовые услуги ещё не подтверждены/)).toBeTruthy()
  })
  it('обязательные имя/фамилия: валидация не продвигает шаг', async () => {
    const screen = setup(theme); await act(async () => {})
    fireEvent.changeText(screen.getByTestId('onboarding-first-name'), ' '); next(screen)
    expect(screen.getByText('Укажите имя и фамилию')).toBeTruthy(); expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(1)
    expect(api.post).not.toHaveBeenCalled()
  })
})
