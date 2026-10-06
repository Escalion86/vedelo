import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsSection } from './SettingsSection'
import { cacheSettings } from './settingsEditor'
import { ListsSection, normalizeList } from '../lists/ListsSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { MOBILE_SETTINGS_QUERY_KEY } from '../../shared/hooks/useWorkItemTerminology'
import type { MobileSettings } from '../../shared/domain/types'

const mockGet = jest.fn()
const mockPut = jest.fn()
const mockCacheRead = jest.fn()
const mockUpsert = jest.fn()
const mockDispatch = jest.fn()
let mockServer: MobileSettings
let mockCache: MobileSettings[]
let mockPrevented: boolean
let mockOnRemove: (event: any) => void
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: mockDispatch }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), put: (...args: any[]) => mockPut(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: (...args: any[]) => mockCacheRead(...args), upsertEntities: (...args: any[]) => mockUpsert(...args) }))
const fixture = (): MobileSettings => ({ _id: 'settings', towns: ['Москва'], defaultTown: 'Москва', timeZone: 'Europe/Moscow', addresses: [{ city: 'Москва' }], custom: { eventTypes: ['Съёмка'], primaryEntityTerminology: 'events', onboardingActivityPreset: 'photo_video', unknownSetting: 'keep', eventFormVariant: 'classic' } })
const draw = (lists = false, mode: 'light' | 'dark' = 'light') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(MOBILE_SETTINGS_QUERY_KEY, fixture())
  const screen = render(<QueryClientProvider client={client}><ThemeProvider forcedMode={mode} storage={null}>{lists ? <ListsSection /> : <SettingsSection />}</ThemeProvider></QueryClientProvider>)
  return { ...screen, client }
}
const settled = async (screen: ReturnType<typeof draw>, lists = false) => {
  await act(async () => { await Promise.resolve() })
  await waitFor(() => expect(screen.queryByText(lists ? 'Загружаем списки…' : 'Загружаем настройки…')).toBeNull())
}
const addTown = (screen: ReturnType<typeof draw>, name = 'Омск') => {
  fireEvent.changeText(screen.getByLabelText('Новый город'), name)
  fireEvent.press(screen.getByText('Добавить город'))
}
beforeEach(() => {
  jest.clearAllMocks()
  mockServer = fixture(); mockCache = [fixture()]
  mockGet.mockImplementation(async () => ({ success: true, data: mockServer }))
  mockPut.mockImplementation(async (endpoint: string, payload: any) => {
    mockServer = { ...mockServer, ...('towns' in payload ? { towns: payload.towns, defaultTown: payload.defaultTown } : {}), custom: { ...mockServer.custom, ...('primaryEntityTerminology' in payload ? { primaryEntityTerminology: payload.primaryEntityTerminology } : { eventTypes: payload.eventTypes }) } }
    return { success: true, data: mockServer }
  })
  mockCacheRead.mockImplementation(async () => mockCache)
  mockUpsert.mockImplementation(async (_kind: string, items: MobileSettings[]) => { mockCache = items })
})
it.each(['light', 'dark'] as const)('W: %s, selected/disabled, compact поля и resolver', async (mode) => {
  const screen = draw(true, mode)
  await settled(screen, true)
  expect(screen.getByText('Типы мероприятий')).toBeTruthy()
  expect(StyleSheet.flatten(screen.getByLabelText('Новый город').props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByRole('radio', { name: 'Город по умолчанию: Москва' }).props.accessibilityState.selected).toBe(true)
  expect(screen.getByRole('button', { name: 'Сохранить списки' }).props.accessibilityState.disabled).toBe(true)
  screen.unmount()
  const settings = draw(false, mode)
  await settled(settings)
  expect(settings.getByRole('radio', { name: 'Мероприятия' }).props.accessibilityState.selected).toBe(true)
  expect(settings.queryByText('Темная тема')).toBeNull()
  expect(settings.queryByText('Отключить синхронизацию с сервером')).toBeNull()
})
it.each(['auto', 'events', 'orders'] as const)('W: терминология %s сохраняется узким PUT, подтверждается GET и обновляет resolver/cache', async (value) => {
  mockServer.custom!.primaryEntityTerminology = value === 'events' ? 'orders' : 'events'
  const screen = draw()
  await settled(screen)
  const label = value === 'auto' ? 'Авто — по сфере работы' : value === 'events' ? 'Мероприятия' : 'Заказы'
  fireEvent.press(screen.getByRole('radio', { name: label }))
  fireEvent.press(screen.getByText('Сохранить настройки'))
  await screen.findByText('Изменения подтверждены сервером')
  expect(mockPut).toHaveBeenCalledWith('/mobile/v1/settings/terminology', { primaryEntityTerminology: value })
  expect(mockGet).toHaveBeenLastCalledWith('/mobile/v1/settings/terminology')
  expect(screen.client.getQueryData<MobileSettings>(MOBILE_SETTINGS_QUERY_KEY)?.custom?.primaryEntityTerminology).toBe(value)
  expect(mockCache[0]).toMatchObject({ towns: ['Москва'], timeZone: 'Europe/Moscow', custom: { unknownSetting: 'keep', eventTypes: ['Съёмка'] } })
  expect(screen.getByText(new RegExp(`Сейчас в приложении: «${value === 'events' ? 'Мероприятия' : 'Заказы'}»`))).toBeTruthy()
})
it('W: поздний GET не стирает введённые город/тип, подтверждение использует тот же endpoint', async () => {
  let resolveRead!: (value: any) => void
  mockGet.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
  const screen = draw(true)
  await waitFor(() => expect(screen.getByLabelText('Новый город').props.editable).toBe(true))
  fireEvent.changeText(screen.getByLabelText('Новый город'), 'Не потерять')
  fireEvent.changeText(screen.getByLabelText('Новый тип'), 'Новый тип')
  await act(async () => resolveRead({ success: true, data: { ...fixture(), towns: ['Поздний город'] } }))
  await settled(screen, true)
  expect(screen.getByLabelText('Новый город').props.value).toBe('Не потерять')
  expect(screen.getByLabelText('Новый тип').props.value).toBe('Новый тип')
  fireEvent.press(screen.getByText('Добавить город')); fireEvent.press(screen.getByText('Добавить тип'))
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Изменения подтверждены сервером')
  expect(mockPut.mock.calls[0][1].towns).toEqual(['Москва', 'Не потерять'])
  expect(mockPut.mock.calls[0][0]).toBe('/mobile/v1/lists')
  expect(mockGet).toHaveBeenLastCalledWith('/mobile/v1/lists')
})
it('W: позднее чтение кэша не стирает ввод и не откатывает серверный снимок', async () => {
  let resolveCache!: (value: any) => void
  mockCacheRead.mockImplementationOnce(() => new Promise((resolve) => { resolveCache = resolve }))
  const screen = draw()
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Заказы' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByRole('radio', { name: 'Заказы' }))
  await act(async () => resolveCache([{ ...fixture(), custom: { primaryEntityTerminology: 'auto' } }]))
  await settled(screen)
  expect(screen.getByRole('radio', { name: 'Заказы' }).props.accessibilityState.selected).toBe(true)
})
it('W: узкий DTO списков сохраняет терминологию/прочие поля в обоих кэшах', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  client.setQueryData(MOBILE_SETTINGS_QUERY_KEY, fixture())
  await cacheSettings(client, { _id: 'settings', syncVersion: 99, towns: ['Омск'], defaultTown: '', custom: { eventTypes: ['Ремонт'] } }, 'lists')
  const expected = { towns: ['Омск'], syncVersion: 99, addresses: [{ city: 'Москва' }], timeZone: 'Europe/Moscow', custom: { primaryEntityTerminology: 'events', onboardingActivityPreset: 'photo_video', unknownSetting: 'keep', eventFormVariant: 'classic', eventTypes: ['Ремонт'] } }
  expect(mockCache[0]).toMatchObject(expected)
  expect(client.getQueryData(MOBILE_SETTINGS_QUERY_KEY)).toMatchObject(expected)
})
it('W: параллельные UI merges списков и терминологии не затирают друг друга', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  client.setQueryData(MOBILE_SETTINGS_QUERY_KEY, fixture())
  await Promise.all([
    cacheSettings(client, { _id: 'settings', towns: ['Омск'], custom: { eventTypes: ['Ремонт'] } }, 'lists'),
    cacheSettings(client, { _id: 'settings', custom: { primaryEntityTerminology: 'orders' } }, 'terminology'),
  ])
  expect(mockCache[0]).toMatchObject({ towns: ['Омск'], custom: { eventTypes: ['Ремонт'], primaryEntityTerminology: 'orders', unknownSetting: 'keep' } })
})
it('W: success=false PUT не считается успехом, черновик сохранён и повтор возможен', async () => {
  const screen = draw(true)
  await settled(screen, true)
  addTown(screen)
  mockPut.mockResolvedValueOnce({ success: false, data: fixture() })
  const readsBefore = mockGet.mock.calls.length
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Не удалось подтвердить сохранение. Ввод сохранён; повторите действие при наличии сети.')
  expect(screen.queryByText('Изменения подтверждены сервером')).toBeNull()
  expect(mockGet).toHaveBeenCalledTimes(readsBefore)
  expect(screen.getByText('Омск')).toBeTruthy()
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Изменения подтверждены сервером')
})
it.each(['false', 'mismatch', 'other-id', 'missing-id', 'network'])('W: неподтверждённый GET (%s) не выдаёт успех и не обновляет cache', async (reason) => {
  const screen = draw()
  await settled(screen)
  fireEvent.press(screen.getByRole('radio', { name: 'Заказы' }))
  const before = mockUpsert.mock.calls.length
  if (reason === 'network') mockGet.mockRejectedValueOnce(new Error('offline'))
  else mockGet.mockImplementationOnce(async () => ({ success: reason !== 'false', data: { ...mockServer, _id: reason === 'other-id' ? 'other' : reason === 'missing-id' ? '' : 'settings', custom: { primaryEntityTerminology: reason === 'mismatch' ? 'events' : 'orders' } } }))
  fireEvent.press(screen.getByText('Сохранить настройки'))
  await screen.findByText('Не удалось подтвердить сохранение. Ввод сохранён; повторите действие при наличии сети.')
  expect(screen.queryByText('Изменения подтверждены сервером')).toBeNull()
  expect(screen.getByRole('radio', { name: 'Заказы' }).props.accessibilityState.selected).toBe(true)
  expect(mockUpsert).toHaveBeenCalledTimes(before)
})
it('W: двойной save и ввод во время операции заблокированы, успех ждёт повторного GET', async () => {
  let resolvePut!: (value: any) => void
  let resolveConfirm!: (value: any) => void
  const screen = draw(true)
  await settled(screen, true)
  addTown(screen)
  mockPut.mockImplementationOnce(() => new Promise((resolve) => { resolvePut = resolve }))
  mockGet.mockImplementationOnce(() => new Promise((resolve) => { resolveConfirm = resolve }))
  fireEvent.press(screen.getByText('Сохранить списки')); fireEvent.press(screen.getByText('Сохранить списки'))
  expect(mockPut).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Новый город').props.editable).toBe(false)
  const data = { ...fixture(), towns: ['Москва', 'Омск'] }
  await act(async () => resolvePut({ success: true, data }))
  expect(screen.queryByText('Изменения подтверждены сервером')).toBeNull()
  await act(async () => resolveConfirm({ success: true, data }))
  await screen.findByText('Изменения подтверждены сервером')
})
it('W: последняя офлайн-копия показана явно; чтение/повтор не стирают draft после ошибки', async () => {
  mockGet.mockRejectedValue(new Error('network'))
  const screen = draw(true)
  await settled(screen, true)
  expect(screen.getByText('Показана последняя офлайн-копия. Для сохранения требуется сеть.')).toBeTruthy()
  addTown(screen)
  fireEvent.press(screen.getByText('Повторить загрузку'))
  await settled(screen, true)
  expect(screen.getByText('Омск')).toBeTruthy()
  mockPut.mockRejectedValueOnce(new Error('network'))
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Не удалось подтвердить сохранение. Ввод сохранён; повторите действие при наличии сети.')
  expect(screen.getByText('Омск')).toBeTruthy()
})
it('W: без кэша ошибка чтения не выглядит пустым успешным списком; retry работает', async () => {
  mockCache = []; mockGet.mockRejectedValueOnce(new Error('network'))
  const screen = draw(true)
  await settled(screen, true)
  expect(screen.queryByText('Городов пока нет')).toBeNull()
  expect(screen.getByLabelText('Новый город').props.editable).toBe(false)
  fireEvent.press(screen.getByText('Повторить загрузку'))
  await settled(screen, true)
  expect(screen.getByText('Москва')).toBeTruthy()
})
it('W: дубликаты/пустые строки не добавляются, удаление default подтверждается и снимает его', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(true)
  await settled(screen, true)
  addTown(screen, '  МОСКВА  ')
  expect(screen.getAllByText('Москва')).toHaveLength(1)
  addTown(screen, '   ')
  expect(normalizeList([' Москва ', 'МОСКВА', '', ' Омск '])).toEqual(['Москва', 'Омск'])
  fireEvent.press(screen.getByLabelText('Удалить город Москва'))
  expect(screen.getByText('Москва')).toBeTruthy()
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  fireEvent.changeText(screen.getByLabelText('Новый город'), '')
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Изменения подтверждены сервером')
  expect(mockPut.mock.calls[0][1]).toMatchObject({ towns: [], defaultTown: '' })
  alert.mockRestore()
})
it('W: новый город становится default; смена default и удаление типа согласованы с записью', async () => {
  mockServer.towns = []; mockServer.defaultTown = ''; mockCache = [mockServer]
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(true)
  await settled(screen, true)
  addTown(screen, 'Омск'); addTown(screen, 'Томск')
  fireEvent.press(screen.getByRole('radio', { name: 'Город по умолчанию: Томск' }))
  fireEvent.press(screen.getByLabelText('Удалить тип Съёмка'))
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  fireEvent.press(screen.getByText('Сохранить списки'))
  await screen.findByText('Изменения подтверждены сервером')
  expect(mockPut.mock.calls[0][1]).toEqual({ towns: ['Омск', 'Томск'], defaultTown: 'Томск', eventTypes: [] })
  alert.mockRestore()
})
it('W: незавершённая строка не теряется при сохранении, несохранённый выход подтверждается', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(true)
  await settled(screen, true)
  fireEvent.changeText(screen.getByLabelText('Новый тип'), 'Не добавлен')
  fireEvent.press(screen.getByText('Сохранить списки'))
  expect(screen.getByText('Добавьте введённый город или тип в список перед сохранением.')).toBeTruthy()
  expect(mockPut).not.toHaveBeenCalled()
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  alert.mockRestore()
})
it('W: ошибка локальной записи после GET обозначена отдельно, не выдаёт офлайн-сохранение', async () => {
  const screen = draw()
  await settled(screen)
  fireEvent.press(screen.getByRole('radio', { name: 'Заказы' }))
  mockUpsert.mockRejectedValueOnce(new Error('storage unavailable'))
  fireEvent.press(screen.getByText('Сохранить настройки'))
  await screen.findByText('Запись подтверждена сервером, но офлайн-копия не обновлена. Повторите сохранение при восстановлении хранилища.')
  expect(screen.queryByText('Изменения подтверждены сервером')).toBeNull()
})
it('W: первое чтение без кэша сохраняет специализацию и часовой пояс, узкий DTO не обнуляет их', async () => {
  mockCache = []
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  await cacheSettings(client, fixture(), 'terminology')
  expect(client.getQueryData(MOBILE_SETTINGS_QUERY_KEY)).toMatchObject({ timeZone: 'Europe/Moscow', custom: { onboardingActivityPreset: 'photo_video', primaryEntityTerminology: 'events', eventTypes: ['Съёмка'] } })
  await cacheSettings(client, { _id: 'settings', towns: [], defaultTown: '', custom: { eventTypes: [] } }, 'lists')
  expect(mockCache[0]).toMatchObject({ timeZone: 'Europe/Moscow', custom: { onboardingActivityPreset: 'photo_video', primaryEntityTerminology: 'events' } })
})
it('W: неполный ответ lists не принимается за пустые списки', async () => {
  mockCache = []
  mockGet.mockResolvedValueOnce({ success: true, data: { _id: 'settings' } })
  const screen = draw(true)
  await settled(screen, true)
  expect(screen.getByText('Не удалось получить настройки с сервера. Повторите загрузку.')).toBeTruthy()
  expect(screen.queryByText('Городов пока нет')).toBeNull()
  expect(screen.getByLabelText('Новый город').props.editable).toBe(false)
})
it('W: новый tenant без записи settings создаёт терминологию и подтверждает её GET', async () => {
  mockCache = []
  mockGet.mockResolvedValueOnce({ success: true, data: null })
  const screen = draw()
  await settled(screen)
  fireEvent.press(screen.getByRole('radio', { name: 'Заказы' }))
  fireEvent.press(screen.getByText('Сохранить настройки'))
  await screen.findByText('Изменения подтверждены сервером')
  expect(mockPut).toHaveBeenCalledWith('/mobile/v1/settings/terminology', { primaryEntityTerminology: 'orders' })
})
it.each(['other-id', 'false-string'] as const)('W: некорректный PUT %s не подтверждает запись', async (reason) => {
  const screen = draw()
  await settled(screen)
  fireEvent.press(screen.getByRole('radio', { name: 'Заказы' }))
  mockPut.mockResolvedValueOnce({ success: reason === 'false-string' ? 'false' : true, data: { ...fixture(), _id: reason === 'other-id' ? 'other' : 'settings', custom: { primaryEntityTerminology: 'orders' } } })
  const reads = mockGet.mock.calls.length
  fireEvent.press(screen.getByText('Сохранить настройки'))
  await screen.findByText('Не удалось подтвердить сохранение. Ввод сохранён; повторите действие при наличии сети.')
  expect(mockGet).toHaveBeenCalledTimes(reads)
  expect(screen.queryByText('Изменения подтверждены сервером')).toBeNull()
})
