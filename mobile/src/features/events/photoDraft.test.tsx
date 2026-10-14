import React from 'react'
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react-native'
import { PhotoDraftSection } from './PhotoDraftSection'
import * as Picker from 'expo-image-picker'
import { createWorkItemRoute, initialWorkItemMode } from './createOptions'
jest.setTimeout(30000)
configure({ asyncUtilTimeout: 10000 })
let mockOnline = true
let mockAllow = true
let mockDeveloper = true
let mockExists = true
let mockSize = 30
const mockPost = jest.fn()
const mockCamera = jest.fn()
const mockLibrary = jest.fn()
const mockPermission = jest.fn()
const mockBase64 = jest.fn(async () => 'YWJj')
jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: class { get size() { return mockSize }; get exists() { return mockExists }; base64 = mockBase64 } }))
jest.mock('../../shared/api/client', () => ({ api: { post: (...a: unknown[]) => mockPost(...a) } }))
jest.mock('./useAiDraftAccess', () => ({ useAiDraftAccess: () => ({ allowAi: mockAllow, isDeveloper: mockDeveloper, online: mockOnline, assertAvailable: async () => { if (!mockOnline) throw new Error('Нужен интернет') } }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ genitive: 'заказа' }) }))
beforeEach(() => { jest.clearAllMocks(); (Picker.launchCameraAsync as jest.Mock).mockImplementation((...a) => mockCamera(...a)); (Picker.launchImageLibraryAsync as jest.Mock).mockImplementation((...a) => mockLibrary(...a)); (Picker.requestCameraPermissionsAsync as jest.Mock).mockImplementation(() => mockPermission()); (Picker.requestMediaLibraryPermissionsAsync as jest.Mock).mockImplementation(() => mockPermission()); mockOnline = true; mockAllow = true; mockDeveloper = true; mockExists = true; mockSize = 30; mockPermission.mockResolvedValue({ granted: true }); mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///note.png', mimeType: 'image/png', fileSize: 30 }] }); mockCamera.mockResolvedValue({ canceled: true }); mockPost.mockResolvedValue({ sourceText: 'Заметка', fields: { eventType: 'Шоу' }, aiWarnings: ['Проверьте дату'] }) })
it('photo route uses safe mode without draft in URL', () => { expect(initialWorkItemMode('photo')).toBe('photo'); expect(createWorkItemRoute('photo' as any).params.mode).toBe('photo') })
it('explicit recognize, preview, apply only and skipRefresh', async () => {
  const apply = jest.fn(); const screen = render(<PhotoDraftSection onApply={apply} />)
  fireEvent.press(screen.getByText('Выбрать изображение')); await screen.findByTestId('photo-preview'); expect(mockPost).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Распознать и заполнить')); await screen.findByText('Заметка'); expect(apply).not.toHaveBeenCalled()
  expect(mockPost).toHaveBeenCalledWith('/mobile/v1/events/ai-photo-draft', { image: 'data:image/png;base64,YWJj' }, { skipRefresh: true })
  await act(async () => { fireEvent.press(screen.getByText('Применить к форме')) }); expect(apply).toHaveBeenCalledWith({ eventType: 'Шоу' }, { sourceText: 'Заметка', aiWarnings: ['Проверьте дату'], aiFilledFields: [] })
})
it('camera denied/cancel do not submit', async () => {
  mockPermission.mockResolvedValueOnce({ granted: false }); const screen = render(<PhotoDraftSection onApply={jest.fn()} />)
  fireEvent.press(screen.getByText('Снять фотографию')); await screen.findByText(/доступ к камере/i)
  fireEvent.press(screen.getByText('Снять фотографию')); await waitFor(() => expect(mockCamera).toHaveBeenCalled()); expect(mockPost).not.toHaveBeenCalled()
})
it('oversize and broken file, error retry and offline', async () => {
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///big.png', mimeType: 'image/png', fileSize: 6000000 }] })
  const screen = render(<PhotoDraftSection onApply={jest.fn()} />); fireEvent.press(screen.getByText('Выбрать изображение')); await screen.findByText('Фото слишком большое. Максимум 5 МБ.')
  fireEvent.press(screen.getByText('Выбрать изображение')); await screen.findByTestId('photo-preview')
  mockPost.mockRejectedValueOnce(new Error('Выберите другое фото')); fireEvent.press(screen.getByText('Распознать и заполнить')); await screen.findByText('Выберите другое фото')
  fireEvent.press(screen.getByText('Распознать и заполнить')); await screen.findByText('Заметка'); expect(mockPost).toHaveBeenCalledTimes(2)
  mockOnline = false; screen.rerender(<PhotoDraftSection onApply={jest.fn()} />); expect(screen.getByText(/нужен интернет/i)).toBeTruthy()
})
it('non-developer cannot open photo controls by direct route', () => {
  mockDeveloper = false
  const screen = render(<PhotoDraftSection onApply={jest.fn()} />)
  expect(screen.queryByText('Выбрать изображение')).toBeNull()
  expect(mockPost).not.toHaveBeenCalled()
})
it('denied tariff hides photo controls', () => { mockAllow = false; const screen = render(<PhotoDraftSection onApply={jest.fn()} />); expect(screen.queryByText('Выбрать изображение')).toBeNull() })

it('broken file is rejected locally; library cancel keeps previous selection', async () => {
  mockExists = false
  const screen = render(<PhotoDraftSection onApply={jest.fn()} />)
  fireEvent.press(screen.getByText('Выбрать изображение')); await screen.findByText('Файл повреждён. Выберите другое фото.')
  expect(mockPost).not.toHaveBeenCalled()
  mockExists = true
  fireEvent.press(screen.getByText('Выбрать изображение')); await screen.findByTestId('photo-preview')
  mockLibrary.mockResolvedValueOnce({ canceled: true }); fireEvent.press(screen.getByText('Выбрать изображение'))
  await waitFor(() => expect(mockLibrary).toHaveBeenCalledTimes(3)); expect(screen.getByTestId('photo-preview')).toBeTruthy()
  expect(mockPost).not.toHaveBeenCalled()
})

it('A: retry применения хранит результат и не повторяет платный POST', async () => {
  const apply = jest.fn().mockRejectedValueOnce(new Error('Нет сети')).mockResolvedValueOnce(undefined)
  mockPost.mockResolvedValueOnce({ sourceText: 'Заметка', fields: { contractSum: 123.45 }, aiWarnings: ['Проверьте сумму'], aiFilledFields: ['contractSum'] })
  const screen = render(<PhotoDraftSection onApply={apply} />)
  fireEvent.press(screen.getByText('Выбрать изображение'))
  await screen.findByTestId('photo-preview')
  fireEvent.press(screen.getByText('Распознать и заполнить'))
  await screen.findByText('Заметка')
  await act(async () => fireEvent.press(screen.getByText('Применить к форме')))
  expect(screen.getByText('Заметка')).toBeTruthy()
  expect(screen.getByText('Проверьте сумму')).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByText('Применить к форме')))
  expect(mockPost).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenLastCalledWith({ contractSum: 123.45 }, { sourceText: 'Заметка', aiWarnings: ['Проверьте сумму'], aiFilledFields: ['contractSum'] })
})
