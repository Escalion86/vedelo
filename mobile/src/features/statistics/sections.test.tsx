import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Share, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { StatisticsSection } from './StatisticsSection'
import { ReferralsSection } from '../referrals/ReferralsSection'
import { shareStatisticsCsv } from './exportCsv'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockGet = jest.fn(); const mockPush = jest.fn()
let mockFocus = true; let mockUser = { _id: 'a'.repeat(24), tenantId: 'tenant-a', role: 'dev' }
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://current.example/api' } }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ mode: 'orders', label: 'заказ', labelCapitalized: 'Заказ', plural: 'заказы', pluralCapitalized: 'Заказы' }) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))
jest.mock('./exportCsv', () => ({ shareStatisticsCsv: jest.fn() }))
const draw = (kind: 'statistics' | 'referrals' = 'statistics', mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}>{kind === 'statistics' ? <StatisticsSection /> : <ReferralsSection />}</ThemeProvider>
function deferred() { let resolve!: (value: any) => void; let reject!: (value: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const statistics = (path: string, amount = 123) => { const query = new URL(`https://local.example${path}`).searchParams; return { success: true, data: { events: [], clients: [], transactions: amount ? [{ _id: 'tx-1', clientId: null, eventId: null, amount, type: 'income', category: '', date: null, comment: 'Кириллица; "внутри"\nновая строка' }] : [], filters: { year: query.has('year') ? Number(query.get('year')) : null, town: query.get('town') || '', status: query.get('status') || 'all' } } } }
const referralData = (name = 'Анна') => ({ success: true, data: { referralsCount: 1, rewardsCount: 2, rewardsTotal: 50, referrals: [{ user: { _id: 'c'.repeat(24), firstName: name, secondName: 'Фамилия '.repeat(15), thirdName: '', registrationType: '', createdAt: '2026-10-01T00:00:00Z' }, rewardsCount: 2, rewardsTotal: 50, lastRewardAt: '2026-10-02T00:00:00Z' }] } })
beforeEach(() => { jest.resetAllMocks(); mockFocus = true; mockUser = { _id: 'a'.repeat(24), tenantId: 'tenant-a', role: 'dev' }; mockGet.mockImplementation(async (path: string) => path.includes('/referrals') ? referralData() : statistics(path)); (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true); (shareStatisticsCsv as jest.Mock).mockResolvedValue(undefined) })
it.each(['light', 'dark'] as const)('статистика %s с financial hierarchy/terms, подтверждённые данные для CSV', async (mode) => {
  const screen = render(draw('statistics', mode)); const net = await screen.findByTestId('statistics-net')
  expect(StyleSheet.flatten(net.props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByText('Доходы: 123 ₽')).toBeTruthy(); expect(screen.getByText(/Заказы: 0/)).toBeTruthy()
  fireEvent.press(screen.getByText('Экспортировать CSV')); await waitFor(() => expect(shareStatisticsCsv).toHaveBeenCalledTimes(1)); expect((shareStatisticsCsv as jest.Mock).mock.calls[0][0]).toContain('\ufeffТип;ID;')
})
it.each(['statistics', 'referrals'] as const)('%s не рисует нули до ответа, 403 и invalid/success:false имеют retry', async (kind) => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise)
  const screen = render(draw(kind)); expect(screen.queryByTestId('statistics-net')).toBeNull(); expect(screen.queryByText(/Начислено: 0/)).toBeNull()
  fireEvent.press(screen.queryByText('Экспортировать CSV') || screen.getByText('Обновить')); expect(shareStatisticsCsv).not.toHaveBeenCalled()
  await act(async () => pending.reject({ status: 403, message: 'SECRET PII' }))
  expect(screen.getByText(/Нет доступа/)).toBeTruthy(); expect(screen.queryByText('SECRET PII')).toBeNull()
  mockGet.mockResolvedValueOnce({ success: false }); fireEvent.press(screen.getByText('Повторить загрузку')); await screen.findByText(/Не удалось загрузить данные/)
  fireEvent.press(screen.getByText('Повторить загрузку')); await screen.findByText(kind === 'statistics' ? 'Финансовый результат' : 'Ваша реферальная ссылка')
})
it('статистика меняет фильтр, не показывает/не экспортирует ответ прежнего фильтра', async () => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw())
  fireEvent.press(screen.getByText(/^Фильтры:/)); fireEvent.press(screen.getByText('Все годы'))
  await screen.findByTestId('statistics-net'); await act(async () => pending.resolve(statistics('/mobile/v1/statistics?status=all&year=2026', 999)))
  expect(screen.queryByText('Доходы: 999 ₽')).toBeNull(); fireEvent.press(screen.getByText('Экспортировать CSV'))
  await waitFor(() => expect(shareStatisticsCsv).toHaveBeenCalledTimes(1)); expect((shareStatisticsCsv as jest.Mock).mock.calls[0][0]).not.toContain('999')
})
it('экспорт до подтверждения нового города и при ошибке запрещён', async () => {
  const screen = render(draw()); await screen.findByTestId('statistics-net'); fireEvent.press(screen.getByText(/^Фильтры:/)); fireEvent.changeText(screen.getByLabelText('Город'), 'Красноярск')
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); fireEvent.press(screen.getByText('Применить город')); fireEvent.press(screen.getByText('Экспортировать CSV'))
  expect(shareStatisticsCsv).not.toHaveBeenCalled(); await act(async () => pending.reject(new Error('network'))); fireEvent.press(screen.getByText('Экспортировать CSV')); expect(shareStatisticsCsv).not.toHaveBeenCalled()
})
it('экспорт блокирует двойной share, поздняя ошибка после смены фильтра скрыта', async () => {
  const pending = deferred(); (shareStatisticsCsv as jest.Mock).mockReturnValueOnce(pending.promise); const screen = render(draw()); await screen.findByTestId('statistics-net')
  fireEvent.press(screen.getByText('Экспортировать CSV')); fireEvent.press(screen.getByText('Экспортировать CSV')); expect(shareStatisticsCsv).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByText(/^Фильтры:/)); fireEvent.press(screen.getByText('Все годы')); await screen.findByTestId('statistics-net')
  expect((shareStatisticsCsv as jest.Mock).mock.calls[0][1]()).toBe(false)
  await act(async () => pending.reject(new Error('native'))); expect(screen.queryByText(/Не удалось экспортировать/)).toBeNull()
  fireEvent.press(screen.getByText('Экспортировать CSV')); await waitFor(() => expect(shareStatisticsCsv).toHaveBeenCalledTimes(2))
})
it.each(['statistics', 'referrals'] as const)('%s session change, blur и unmount игнорируют поздние ответы', async (kind) => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw(kind))
  mockUser = { _id: 'b'.repeat(24), tenantId: 'tenant-b', role: 'user' }; screen.rerender(draw(kind)); await screen.findByText(kind === 'statistics' ? 'Финансовый результат' : 'Ваша реферальная ссылка')
  await act(async () => pending.resolve(kind === 'statistics' ? statistics('/mobile/v1/statistics?status=all', 999) : referralData('Старый')))
  expect(screen.queryByText(/Старый|Доходы: 999/)).toBeNull()
  if (kind === 'referrals') expect(screen.getByText(`https://current.example/login?mode=register&ref=${mockUser._id}`)).toBeTruthy()
  const late = deferred(); mockGet.mockReturnValueOnce(late.promise); fireEvent.press(screen.getByText('Обновить')); mockFocus = false; screen.rerender(draw(kind)); await act(async () => late.resolve({ success: false }))
  expect(screen.queryByText(/Не удалось загрузить данные/)).toBeNull(); screen.unmount()
})
it.each(['light', 'dark'] as const)('рефералы %s: scope=mine для dev, правильные строки и безопасная ссылка', async (mode) => {
  const screen = render(draw('referrals', mode)); await screen.findByText('Ваша реферальная ссылка')
  expect(mockGet.mock.calls.every(([path]) => path === '/mobile/v1/referrals?scope=mine')).toBe(true)
  expect(screen.getByText('50 ₽ · Начислений: 2')).toBeTruthy(); expect(screen.getByText(/Последнее начисление:/)).toBeTruthy()
  const link = screen.getByText(`https://current.example/login?mode=register&ref=${mockUser._id}`)
  expect(StyleSheet.flatten(link.props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.queryByText(/5%|QR|Выручка/)).toBeNull()
})
it('clipboard false/rejection, repeat guard, share отмена и поздний результат', async () => {
  const pending = deferred(); (Clipboard.setStringAsync as jest.Mock).mockReturnValueOnce(pending.promise)
  const screen = render(draw('referrals')); await screen.findByText('Ваша реферальная ссылка')
  fireEvent.press(screen.getByText('Скопировать ссылку')); fireEvent.press(screen.getByText('Скопировать ссылку')); expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(false)); expect(screen.getByText(/Не удалось скопировать/)).toBeTruthy()
  fireEvent.press(screen.getByText('Скопировать ссылку')); await screen.findByText('Реферальная ссылка скопирована')
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction }); fireEvent.press(screen.getByText('Поделиться ссылкой')); await waitFor(() => expect(share).toHaveBeenCalledTimes(1)); share.mockRestore()
  const late = deferred(); (Clipboard.setStringAsync as jest.Mock).mockReturnValueOnce(late.promise); fireEvent.press(screen.getByText('Скопировать ссылку')); mockFocus = false; screen.rerender(draw('referrals')); await act(async () => late.resolve(true)); expect(screen.queryByText('Реферальная ссылка скопирована')).toBeNull()
})
it('empty для статистики и рефералов отделён от ошибок', async () => {
  mockGet.mockImplementation(async (path: string) => statistics(path, 0)); const stats = render(draw()); await stats.findByText('За выбранный период данных нет'); stats.unmount()
  mockGet.mockResolvedValue({ success: true, data: { referrals: [], referralsCount: 0, rewardsCount: 0, rewardsTotal: 0 } }); const screen = render(draw('referrals')); await screen.findByText('Рефералов пока нет')
})

it.each(['statistics', 'referrals'] as const)('%s unmount инвалидирует незавершённый запрос', async (kind) => {
  const pending = deferred(); mockGet.mockReturnValueOnce(pending.promise); const screen = render(draw(kind)); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1)); screen.unmount()
  await act(async () => pending.resolve(kind === 'statistics' ? statistics('/mobile/v1/statistics?status=all') : referralData('Поздний')))
  expect(shareStatisticsCsv).not.toHaveBeenCalled(); expect(Clipboard.setStringAsync).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
})
