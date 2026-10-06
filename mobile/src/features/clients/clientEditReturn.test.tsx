import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import ClientEditScreen from '../../../app/clients/edit/[id]'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { consumePendingEventClient, resetPendingEventClient } from '../../shared/domain/eventClientHandoff'

let mockParams: Record<string, unknown>
const mockReplace = jest.fn()
const mockBack = jest.fn()
const mockSave = jest.fn()
const mockInvalidate = jest.fn(async () => undefined)
const mockDispatch = jest.fn()
let mockPrevented = false
let mockOnRemove: (event: any) => void
const mockGet = jest.fn(async () => null as any)

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({
  router: { replace: (path: unknown) => mockReplace(path), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: mockDispatch }),
}))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: () => mockGet() }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args), deleteLocalEntity: jest.fn() }))

const renderScreen = () => render(
  <ThemeProvider storage={null} forcedMode="light">
    <ClientEditScreen />
  </ThemeProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  resetPendingEventClient()
  mockGet.mockResolvedValue(null)
  mockParams = { id: 'new', returnTo: 'event' }
  mockSave.mockResolvedValue({ _id: 'local-new-client' })
})

it('P: созданный из редактора работы клиент возвращается назад и передаётся через handoff', async () => {
  const screen = renderScreen()
  fireEvent.changeText(screen.getByTestId('client-first-name'), 'Галина')
  fireEvent.press(screen.getByTestId('save-client'))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
  expect(mockReplace).not.toHaveBeenCalled()
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'clients', entityId: undefined }))
  expect(consumePendingEventClient()).toBe('local-new-client')
})

it('P: обычное сохранение клиента не создаёт ожидание и открывает карточку', async () => {
  mockParams = { id: 'new' }
  const screen = renderScreen()
  fireEvent.changeText(screen.getByTestId('client-first-name'), 'Галина')
  fireEvent.press(screen.getByTestId('save-client'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/clients/local-new-client'))
  expect(mockBack).not.toHaveBeenCalled()
  expect(consumePendingEventClient()).toBeNull()
})

it('S: единое ФИО как web, порядок контактов и свёрнутые реквизиты не теряют значения', async () => {
  mockParams = { id: 'saved' }
  mockGet.mockResolvedValue({ _id: 'saved', firstName: 'Анна', secondName: 'Иванова', phone: 79991234567, inn: '1234567890', legalName: 'ООО Тест', messengerPushMuted: true, max: 'https://max.ru/anna' })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByLabelText('ФИО').props.value).toBe('Иванова Анна'))
  expect(screen.queryByLabelText('ИНН')).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: /Реквизиты для договора/ }))
  expect(screen.getByLabelText('ИНН').props.value).toBe('1234567890')
  fireEvent.press(screen.getByRole('button', { name: /Реквизиты для договора/ }))
  fireEvent.changeText(screen.getByLabelText('Комментарий'), 'изменение')
  fireEvent.press(screen.getByTestId('save-client'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ inn: '1234567890', legalName: 'ООО Тест', messengerPushMuted: true, firstName: 'Анна', secondName: 'Иванова' }) })))
})
it('S: чтение отсутствующего клиента не предлагает пустую форму или сохранение', async () => {
  mockParams = { id: 'missing' }
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByText('Клиент не найден в локальных данных')).toBeTruthy())
  expect(screen.queryByTestId('save-client')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
})
it('S: ошибка чтения — повтор, а не пустые значения', async () => {
  mockParams = { id: 'saved' }
  mockGet.mockRejectedValueOnce(new Error('Нет доступа к кэшу')).mockResolvedValue({ _id: 'saved', firstName: 'Анна' })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByText('Нет доступа к кэшу')).toBeTruthy())
  fireEvent.press(screen.getByText('Повторить чтение'))
  await waitFor(() => expect(screen.getByTestId('client-first-name').props.value).toBe('Анна'))
})
it('S: ошибка сохранения сохраняет ФИО/MAX/реквизиты; повторный тап не создаёт вторую запись', async () => {
  let rejectSave!: (reason: Error) => void
  mockSave.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
  const screen = renderScreen()
  fireEvent.changeText(screen.getByTestId('client-first-name'), 'Фамилия Имя Отчество')
  fireEvent.changeText(screen.getByLabelText('MAX'), 'https://max.ru/anna')
  fireEvent.press(screen.getByRole('button', { name: /Реквизиты для договора/ }))
  fireEvent.changeText(screen.getByLabelText('ИНН'), '1234567890')
  fireEvent.press(screen.getByTestId('save-client')); fireEvent.press(screen.getByTestId('save-client'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  await act(async () => rejectSave(new Error('Нет места')))
  expect(screen.getByText('Нет места')).toBeTruthy()
  expect(screen.getByTestId('client-first-name').props.value).toBe('Фамилия Имя Отчество')
  expect(screen.getByLabelText('ИНН').props.value).toBe('1234567890')
  expect(mockBack).not.toHaveBeenCalled()
})
it('S: выход с изменениями требует подтверждения, отмена не сохраняет', () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = renderScreen()
  expect(mockPrevented).toBe(false)
  fireEvent.changeText(screen.getByTestId('client-first-name'), 'Анна')
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')?.onPress?.())
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' })
  expect(mockSave).not.toHaveBeenCalled()
  alert.mockRestore()
})
it('S: изменение только ФИО хранится в firstName, как текущая web-форма', async () => {
  mockParams = { id: 'saved' }
  mockGet.mockResolvedValue({ _id: 'saved', firstName: 'Анна', secondName: 'Иванова', thirdName: 'Ивановна' })
  const screen = renderScreen()
  await waitFor(() => expect(screen.getByTestId('client-first-name').props.value).toBe('Иванова Анна Ивановна'))
  fireEvent.changeText(screen.getByTestId('client-first-name'), 'Петрова Анна')
  fireEvent.press(screen.getByTestId('save-client'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ firstName: 'Петрова Анна', secondName: '', thirdName: '' }) })))
})
