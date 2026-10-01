import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Keyboard } from 'react-native'
import EventEditScreen from '../../../app/events/edit/[id]'

let mockParams: Record<string, unknown>
let mockPrevented = false
let mockOnRemove: (event: any) => void
const mockDispatch = jest.fn()
const mockSave = jest.fn()
const mockGetEntity = jest.fn()
const mockReplace = jest.fn()
const mockInvalidate = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), router: { push: jest.fn(), replace: (path: unknown) => mockReplace(path) }, useLocalSearchParams: () => mockParams, useNavigation: () => ({ dispatch: mockDispatch }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('@tanstack/react-query', () => ({ QueryClientContext: jest.requireActual('@tanstack/react-query').QueryClientContext, useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({
  listCachedEntities: async (kind: string) => kind === 'clients' ? [{ _id: 'client', firstName: 'Анна' }] : [], getCachedEntity: (...args: unknown[]) => mockGetEntity(...args),
}))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args), deleteLocalEntity: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ genitive: 'заказа', accusative: 'заказ' }) }))
jest.mock('./VoiceDraftSection', () => {
  const { Text } = require('react-native')
  return { VoiceDraftSection: ({ initialMode }: { initialMode: string }) => <Text>{`mode:${initialMode}`}</Text> }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'new', clientId: 'client' }
  mockSave.mockResolvedValue({ _id: 'local-event' })
  mockGetEntity.mockResolvedValue({ _id: 'existing', status: 'closed', clientId: 'client', eventDate: '2026-10-15', description: 'Существующая работа' })
})

it.each([
  ['active', 'active'], ['draft', 'draft'], ['canceled', 'draft'], ['closed', 'draft'],
  [undefined, 'draft'], [['active'], 'draft'],
])('форма сохраняет начальный status %s как %s через штатную локальную очередь', async (initialStatus, expected) => {
  mockParams = { id: 'new', clientId: 'client', initialStatus }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  fireEvent.changeText(screen.getByTestId('event-type'), 'Тестовая работа')
  if (expected === 'active') fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityType: 'events', values: { status: expected, eventType: 'Тестовая работа' } })
  expect(mockSave.mock.calls[0][0].entityId).toBeUndefined()
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/local-event'))
})

it('смена URL не перезаписывает статус и введённые поля в уже открытой форме', async () => {
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'text' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(screen.getByText('mode:text')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-type'), 'Введённая работа')
  fireEvent.press(screen.getByText('Заявка'))
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'voice' }
  screen.rerender(<EventEditScreen />)
  expect(screen.getByText('mode:text')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values).toMatchObject({ status: 'draft', eventType: 'Введённая работа' })
})

it.each([['existing', undefined, 'closed'], ['new', 'existing', 'draft']])('URL не меняет статус редактируемой/клонируемой работы %s', async (id, cloneId, status) => {
  mockParams = { id, cloneId, initialStatus: 'active', mode: 'voice' }
  const screen = render(<EventEditScreen />)
  await screen.findByDisplayValue('Существующая работа')
  expect(screen.getByText('mode:manual')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values.status).toBe(status)
})

it('уход из новой формы ничего не сохраняет', async () => {
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'voice' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(screen.getByText('mode:voice')).toBeTruthy()
  screen.unmount()
  expect(mockSave).not.toHaveBeenCalled()
})

it('общий draft переживает смену вкладок, клавиатуру, Back и ошибку сохранения', async () => {
  mockSave.mockRejectedValueOnce(new Error('Очередь временно недоступна'))
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-type')
  fireEvent.changeText(screen.getByTestId('event-type'), 'Новый заказ')
  fireEvent.changeText(screen.getByLabelText('Описание'), 'Сохранить текст')
  fireEvent.press(screen.getByTestId('event-section-finance'))
  fireEvent.changeText(screen.getByLabelText('Сумма договора'), '17000')
  fireEvent.press(screen.getByTestId('event-section-contacts'))
  fireEvent.press(screen.getByText('Добавить следующий контакт'))
  fireEvent.changeText(screen.getByLabelText('Что сделать'), 'Перезвонить')
  fireEvent.press(screen.getByTestId('event-section-general'))
  act(() => Keyboard.dismiss())
  expect(screen.getByDisplayValue('Новый заказ')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(alert).toHaveBeenCalled()
  expect(mockDispatch).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('Сохранить текст')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await screen.findByText('Очередь временно недоступна')
  expect(screen.getByDisplayValue('Новый заказ')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-section-finance'))
  expect(screen.getByDisplayValue('17000')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-section-contacts'))
  expect(screen.getByDisplayValue('Перезвонить')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(mockSave).toHaveBeenCalledTimes(2)
  expect(mockSave.mock.calls[1][0].values).toMatchObject({ eventType: 'Новый заказ', contractSum: 17000,
    additionalEvents: [expect.objectContaining({ title: 'Перезвонить' })] })
  alert.mockRestore()
})

it('прямой переход в секцию и local ID сохраняют редактирование через outbox', async () => {
  mockParams = { id: 'local-event', section: 'finance' }
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Сумма договора')
  fireEvent.changeText(screen.getByLabelText('Сумма договора'), '200')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalled())
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityId: 'local-event', values: { contractSum: 200 } })
})

it('ошибка загрузки существующей работы не разрешает перезаписать её пустым draft', async () => {
  mockParams = { id: 'missing' }
  mockGetEntity.mockResolvedValue(null)
  const screen = render(<EventEditScreen />)
  await screen.findByText('Запись не найдена в локальных данных')
  expect(screen.queryByTestId('save-event')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
})

it('ALIGN: отмена прошедшей заявки требует причину и явное сохранение', async () => {
  mockParams = { id: 'past-draft', decision: 'canceled' }
  mockGetEntity.mockResolvedValue({ _id: 'past-draft', status: 'draft', clientId: 'client', eventDate: '2026-09-01' })
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Причина отмены')
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Причина отмены'), 'Клиент отменил')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityId: 'past-draft', values: { status: 'canceled', cancelReason: 'Клиент отменил' } })
})
it('ALIGN: Дата пока неизвестна очищает обе даты только у заявки', async () => {
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Начало')
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  fireEvent.changeText(screen.getByLabelText('Окончание'), '2026-10-15 14:00')
  fireEvent.press(screen.getByText('Дата пока неизвестна'))
  expect(screen.getByLabelText('Начало').props.value).toBe('')
  expect(screen.getByLabelText('Окончание').props.value).toBe('')
  fireEvent.press(screen.getByText('Подтверждено'))
  expect(screen.queryByText('Дата пока неизвестна')).toBeNull()
})
