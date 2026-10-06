import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import { ServiceEditor } from './ServiceEditor'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'

let mockParams: any
let mockEntities: Record<string, any>
const mockGet = jest.fn()
const mockList = jest.fn()
const mockSave = jest.fn()
const mockDelete = jest.fn()
const mockReplace = jest.fn()
const mockDispatch = jest.fn()
const mockQueryClient = { invalidateQueries: jest.fn(async () => undefined) }
let mockPrevented = false
let mockOnRemove: (event: any) => void
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { replace: (path: string) => mockReplace(path) }, useLocalSearchParams: () => mockParams, useNavigation: () => ({ dispatch: mockDispatch }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: (...args: any[]) => mockGet(...args), listCachedEntities: (...args: any[]) => mockList(...args) }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: any[]) => mockSave(...args), deleteLocalEntity: (...args: any[]) => mockDelete(...args) }))
const draw = (group = false, mode: 'light' | 'dark' = 'light') => render(<ThemeProvider storage={null} forcedMode={mode}><ServiceEditor group={group} /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 's' }
  mockEntities = {
    services: [{ _id: 's', title: 'Съёмка', description: 'Описание', price: 100, groupId: 'local-g', images: ['https://example.invalid/image'], archive: false, legacy: 'keep' }],
    serviceGroups: [{ _id: 'local-g', title: 'Фото', order: 3, legacy: 'keep' }],
  }
  mockGet.mockImplementation(async (kind: string, id: string) => mockEntities[kind].find((item: any) => item._id === id) || null)
  mockList.mockImplementation(async (kind: string) => [...mockEntities[kind]])
  mockSave.mockImplementation(async ({ entityType, entityId, values }: any) => {
    const index = mockEntities[entityType].findIndex((item: any) => item._id === entityId)
    const saved = { ...(mockEntities[entityType][index] || {}), ...values, _id: entityId || 'local-new' }
    if (index >= 0) mockEntities[entityType][index] = saved; else mockEntities[entityType].push(saved)
    return saved
  })
  mockDelete.mockImplementation(async (kind: string, id: string) => { mockEntities[kind] = mockEntities[kind].filter((item: any) => item._id !== id) })
})
it.each(['light', 'dark'] as const)('V: %s, partial patch сохраняет все исходные поля', async (mode) => {
  const screen = draw(false, mode)
  await screen.findByLabelText('Название')
  expect(StyleSheet.flatten(screen.getByLabelText('Название').props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  fireEvent.changeText(screen.getByLabelText('Название'), 'Новый заголовок')
  fireEvent.press(screen.getByText('Сохранить'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/more/services'))
  expect(mockSave.mock.calls[0][0].values).toEqual({ title: 'Новый заголовок' })
  expect(mockEntities.services[0]).toMatchObject({ description: 'Описание', price: 100, groupId: 'local-g', images: ['https://example.invalid/image'], archive: false, legacy: 'keep' })
})
it('V: создание услуги со ссылкой на локальную группу', async () => {
  mockParams = { id: 'new', groupId: 'local-g' }
  const screen = draw()
  await screen.findByLabelText('Название')
  fireEvent.changeText(screen.getByLabelText('Название'), 'Услуга')
  fireEvent.press(screen.getByText('Сохранить'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'services', entityId: undefined, values: expect.objectContaining({ groupId: 'local-g' }) })))
})
it('V: not-found и ошибка групп не открывают форму, retry повторяет чтение', async () => {
  mockParams = { id: 'missing' }
  const missing = draw()
  await missing.findByText('Услуга не найдена')
  expect(missing.queryByText('Сохранить')).toBeNull()
  missing.unmount()
  mockParams = { id: 's' }
  mockList.mockRejectedValueOnce(new Error('read failed'))
  const screen = draw()
  await screen.findByText('Не удалось загрузить данные услуги.')
  expect(screen.queryByLabelText('Название')).toBeNull()
  fireEvent.press(screen.getByText('Повторить загрузку'))
  await screen.findByLabelText('Название')
  expect(screen.getByRole('radio', { name: 'Фото' }).props.accessibilityState.selected).toBe(true)
})
it('V: удалённая после чтения услуга не воскрешается сохранением', async () => {
  const screen = draw()
  await screen.findByLabelText('Название')
  fireEvent.changeText(screen.getByLabelText('Название'), 'Правка')
  mockEntities.services = []
  fireEvent.press(screen.getByText('Сохранить'))
  await screen.findByText('Услуга не найдена')
  expect(mockSave).not.toHaveBeenCalled()
})
it('V: двойное сохранение заблокировано, ошибка сохраняет ввод и допускает retry', async () => {
  let rejectSave!: (cause: Error) => void
  mockSave.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
  const screen = draw()
  await screen.findByLabelText('Название')
  fireEvent.changeText(screen.getByLabelText('Описание'), 'Не потерять')
  fireEvent.press(screen.getByText('Сохранить')); fireEvent.press(screen.getByText('Сохранить'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Описание').props.editable).toBe(false)
  await act(async () => rejectSave(new Error('Ошибка очереди')))
  expect(screen.getByLabelText('Описание').props.value).toBe('Не потерять')
  expect(screen.getByText('Ошибка очереди')).toBeTruthy()
  fireEvent.press(screen.getByText('Сохранить'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
})
it('V: выход с правками требует подтверждения; отмена удаления сохраняет запись', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw()
  await screen.findByLabelText('Название')
  fireEvent.changeText(screen.getByLabelText('Название'), 'Правка')
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  fireEvent.press(screen.getByText('Удалить услугу'))
  act(() => alert.mock.calls[1][2]?.find((item) => item.style === 'cancel')?.onPress?.())
  expect(mockDelete).not.toHaveBeenCalled()
  alert.mockRestore()
})
it('V: удаление группы подтверждается, сначала снимает все ссылки, включая архив, услуги остаются', async () => {
  mockParams = { id: 'local-g' }
  mockEntities.services.push({ _id: 'archive', archive: true, groupId: 'local-g', title: 'Архив', price: 777 })
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(true)
  await screen.findByLabelText('Название группы')
  fireEvent.press(screen.getByText('Удалить группу')); fireEvent.press(screen.getByText('Удалить группу'))
  expect(alert).toHaveBeenCalledTimes(1)
  expect(mockDelete).not.toHaveBeenCalled()
  const confirm = alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress
  act(() => { confirm?.(); confirm?.() })
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/more/services'))
  expect(mockDelete).toHaveBeenCalledTimes(1)
  expect(mockSave).toHaveBeenCalledTimes(2)
  expect(mockSave.mock.calls.map((call) => call[0].values)).toEqual([{ groupId: null }, { groupId: null }])
  expect(mockSave.mock.invocationCallOrder[1]).toBeLessThan(mockDelete.mock.invocationCallOrder[0])
  expect(mockEntities.services).toHaveLength(2)
  expect(mockEntities.services[0]).toMatchObject({ title: 'Съёмка', images: ['https://example.invalid/image'], groupId: null })
  expect(mockEntities.services[1]).toMatchObject({ title: 'Архив', archive: true, price: 777, groupId: null })
  alert.mockRestore()
})
it('V: частичная ошибка не удаляет группу, повтор безопасно завершает перенос', async () => {
  mockParams = { id: 'local-g' }
  mockEntities.services.push({ _id: 'second', title: 'Вторая', groupId: 'local-g', price: 9 })
  const regularSave = mockSave.getMockImplementation()!
  mockSave.mockImplementationOnce(regularSave).mockRejectedValueOnce(new Error('queue failure'))
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(true)
  await screen.findByLabelText('Название группы')
  fireEvent.press(screen.getByText('Удалить группу'))
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  await screen.findByText('Не удалось завершить удаление группы. Уже перенесённые услуги остались без группы; повторите действие.')
  expect(mockDelete).not.toHaveBeenCalled()
  expect(mockEntities.serviceGroups).toHaveLength(1)
  expect(mockEntities.services[0].groupId).toBeNull()
  expect(mockEntities.services[1].groupId).toBe('local-g')
  fireEvent.press(screen.getByText('Удалить группу'))
  act(() => alert.mock.calls[1][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1))
  expect(mockEntities.services.map((item: any) => item.groupId)).toEqual([null, null])
  alert.mockRestore()
})
it('V: правка группы сохраняет order/прочие поля, ошибка удаления услуги оставляет форму', async () => {
  mockParams = { id: 'local-g' }
  const screen = draw(true)
  await screen.findByLabelText('Название группы')
  fireEvent.changeText(screen.getByLabelText('Название группы'), 'Новая группа')
  fireEvent.press(screen.getByText('Сохранить'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values).toEqual({ title: 'Новая группа' })
  expect(mockEntities.serviceGroups[0]).toMatchObject({ order: 3, legacy: 'keep' })
  screen.unmount()
  mockParams = { id: 's' }; mockDelete.mockRejectedValueOnce(new Error('delete failure'))
  const alert = jest.spyOn(Alert, 'alert')
  const service = draw()
  await service.findByLabelText('Название')
  fireEvent.press(service.getByText('Удалить услугу'))
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  await service.findByText('Не удалось удалить услугу. Повторите действие.')
  expect(service.getByLabelText('Название').props.value).toBe('Съёмка')
  alert.mockRestore()
})
