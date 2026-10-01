import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import EventEditScreen from '../../../app/events/edit/[id]'

let mockParams: Record<string, unknown>
const mockSave = jest.fn()
const mockGetEntity = jest.fn()
const mockReplace = jest.fn()
const mockInvalidate = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ router: { replace: (path: unknown) => mockReplace(path) }, useLocalSearchParams: () => mockParams }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({
  listCachedEntities: async () => [], getCachedEntity: (...args: unknown[]) => mockGetEntity(...args),
}))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args), deleteLocalEntity: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ genitive: 'заказа', accusative: 'заказ' }) }))
jest.mock('./VoiceDraftSection', () => {
  const { Text } = require('react-native')
  return { VoiceDraftSection: ({ initialMode }: { initialMode: string }) => <Text>{`mode:${initialMode}`}</Text> }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: 'new' }
  mockSave.mockResolvedValue({ _id: 'local-event' })
  mockGetEntity.mockResolvedValue({ _id: 'existing', status: 'closed', description: 'Существующая работа' })
})

it.each([
  ['active', 'active'], ['draft', 'draft'], ['canceled', 'draft'], ['closed', 'draft'],
  [undefined, 'draft'], [['active'], 'draft'],
])('форма сохраняет начальный status %s как %s через штатную локальную очередь', async (initialStatus, expected) => {
  mockParams = { id: 'new', initialStatus }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  fireEvent.changeText(screen.getByTestId('event-type'), 'Тестовая работа')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityType: 'events', values: { status: expected, eventType: 'Тестовая работа' } })
  expect(mockSave.mock.calls[0][0].entityId).toBeUndefined()
  expect(mockReplace).toHaveBeenCalledWith('/events/local-event')
})

it('смена URL не перезаписывает статус и введённые поля в уже открытой форме', async () => {
  mockParams = { id: 'new', initialStatus: 'active', mode: 'text' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(screen.getByText('mode:text')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-type'), 'Введённая работа')
  fireEvent.press(screen.getByText('Заявка'))
  mockParams = { id: 'new', initialStatus: 'active', mode: 'voice' }
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
  mockParams = { id: 'new', initialStatus: 'active', mode: 'voice' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(screen.getByText('mode:voice')).toBeTruthy()
  screen.unmount()
  expect(mockSave).not.toHaveBeenCalled()
})
