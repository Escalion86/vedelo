import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClientTypesSection } from './ClientTypesSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { legacyClientTypes } from '../../shared/domain/clientTypes'

const mockGet = jest.fn()
const mockPut = jest.fn()
const mockUpsert = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-crypto', () => ({ randomUUID: () => '12345678-1234-1234-1234-123456789abc' }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args), put: (...args: unknown[]) => mockPut(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: async () => [{ _id: 'settings', clientTypes: [{ value: 'none', name: 'Без типа', hidden: false }, { value: 'custom_cachedtype', name: 'Офлайн-тип', hidden: false }] }], upsertEntities: (...args: unknown[]) => mockUpsert(...args as []) }))

beforeEach(() => {
  jest.clearAllMocks()
  let catalog = { items: legacyClientTypes.map(x => ({ ...x })), version: 0, settingsId: 'settings' }
  mockGet.mockImplementation(async () => ({ success: true, data: catalog }))
  mockPut.mockImplementation(async (_url, body) => {
    if (body.version !== catalog.version) throw new Error('Список изменён на другом устройстве')
    catalog = { ...catalog, ...body, version: catalog.version + 1 }
    return { success: true, data: catalog }
  })
})
const draw = (mode: 'light' | 'dark' = 'light') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const onAdded = jest.fn()
  const screen = render(<QueryClientProvider client={client}><ThemeProvider forcedMode={mode} storage={null}><ClientTypesSection onAdded={onAdded} /></ThemeProvider></QueryClientProvider>)
  return { ...screen, client, onAdded }
}

it.each(['light', 'dark'] as const)('%s: add selects the new immutable ID and updates offline settings', async mode => {
  const screen = draw(mode)
  await waitFor(() => expect(screen.getByLabelText('Новый тип клиента').props.editable).toBe(true))
  fireEvent.changeText(screen.getByLabelText('Новый тип клиента'), 'Подрядчик')
  fireEvent.press(screen.getByRole('button', { name: 'Добавить тип' }))
  await waitFor(() => expect(screen.onAdded).toHaveBeenCalledWith('custom_12345678-1234-1234-1234-123456789abc'))
  expect(mockPut).toHaveBeenCalledWith('/client-types', expect.objectContaining({ version: 0, items: expect.arrayContaining([expect.objectContaining({ name: 'Подрядчик' })]) }))
  expect(screen.getByLabelText('Название типа «Подрядчик»')).toBeTruthy()
  expect(mockUpsert).toHaveBeenCalledWith('siteSettings', [expect.objectContaining({ clientTypesVersion: 1, clientTypes: expect.arrayContaining([expect.objectContaining({ name: 'Подрядчик' })]) })])
})

it('rename, reorder and hide preserve colleague identity', async () => {
  const screen = draw()
  const input = await screen.findByLabelText('Название типа «Коллега»')
  await waitFor(() => expect(screen.getByLabelText('Название типа «Коллега»').props.editable).toBe(true))
  fireEvent.changeText(input, 'Исполнитель')
  fireEvent.press(screen.getAllByRole('button', { name: 'Сохранить название' })[3])
  await screen.findByLabelText('Название типа «Исполнитель»')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Выше: Исполнитель' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByRole('button', { name: 'Выше: Исполнитель' }))
  await waitFor(() => expect((screen.client.getQueryData(['client-types']) as any).version).toBe(2))
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Скрыть' })[2].props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getAllByRole('button', { name: 'Скрыть' })[2])
  await waitFor(() => expect((screen.client.getQueryData(['client-types']) as any).items[2]).toMatchObject({ value: 'colleague', name: 'Исполнитель', hidden: true }))
})

it('network failure preserves input; offline copy remains readable', async () => {
  const screen = draw()
  await waitFor(() => expect(screen.getByLabelText('Новый тип клиента').props.editable).toBe(true))
  mockPut.mockRejectedValueOnce(new Error('Сеть недоступна'))
  fireEvent.changeText(screen.getByLabelText('Новый тип клиента'), 'Подрядчик')
  fireEvent.press(screen.getByRole('button', { name: 'Добавить тип' }))
  await screen.findByText('Сеть недоступна')
  expect(screen.getByLabelText('Новый тип клиента').props.value).toBe('Подрядчик')
  expect(screen.onAdded).not.toHaveBeenCalled()
  screen.unmount()
  mockGet.mockRejectedValue(new Error('offline'))
  const offline = draw()
  await offline.findByLabelText('Название типа «Офлайн-тип»')
  expect(offline.getByRole('button', { name: 'Добавить тип' }).props.accessibilityState.disabled).toBe(true)
})
