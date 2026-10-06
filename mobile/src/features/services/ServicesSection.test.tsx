import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { ServicesSection } from './ServicesSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'

let mockServices: any
let mockGroups: any
const mockRefetch = jest.fn()
const mockPush = jest.fn()
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: (path: string) => mockPush(path) } }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (kind: string) => kind === 'services' ? mockServices : mockGroups }))
const draw = (mode: 'light' | 'dark' = 'light') => render(<ThemeProvider forcedMode={mode} storage={null}><ServicesSection /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  mockServices = { data: [], isPending: false, isError: false, refetch: mockRefetch }
  mockGroups = { ...mockServices }
})
it('V: загрузка и ошибка не считаются пустым прайсом, повтор доступен', () => {
  mockServices.isPending = true
  const screen = draw()
  expect(screen.getByText('Загружаем услуги и группы…')).toBeTruthy()
  expect(screen.queryByText('Услуги не найдены')).toBeNull()
  mockServices.isPending = false; mockGroups.isError = true
  screen.rerender(<ThemeProvider forcedMode="light" storage={null}><ServicesSection /></ThemeProvider>)
  expect(screen.getByText('Не удалось прочитать прайс. Услуги не считаются отсутствующими.')).toBeTruthy()
  fireEvent.press(screen.getByText('Повторить загрузку'))
  expect(mockRefetch).toHaveBeenCalledTimes(2)
  mockGroups.isError = false
  screen.rerender(<ThemeProvider forcedMode="light" storage={null}><ServicesSection /></ThemeProvider>)
  expect(screen.getByText('Услуги не найдены')).toBeTruthy()
  fireEvent.press(screen.getByText('Добавить услугу'))
  expect(mockPush).toHaveBeenCalledWith('/services/edit/new')
})
it.each(['light', 'dark'] as const)('V: %s, длинные строки/суммы, группы и сворачивание', (mode) => {
  const title = 'Очень длинное название услуги '.repeat(8)
  mockServices.data = [{ _id: 's', title, description: 'Описание '.repeat(30), price: 9876543210.12, duration: 90, groupId: 'gone', syncStatus: 'pending' }, { _id: 'archive', title: 'Архив', archive: true }]
  mockGroups.data = [{ _id: 'g', title: 'Группа', order: 1 }]
  const screen = draw(mode)
  expect(screen.queryByText('Архив')).toBeNull()
  expect(screen.getByText('Без группы (1)')).toBeTruthy()
  const palette = mode === 'dark' ? darkPalette : lightPalette
  expect(StyleSheet.flatten(screen.getByText(title).props.style).color).toBe(palette.cardTitle)
  expect(screen.getByText(/Цена:.*₽/)).toBeTruthy()
  expect(screen.getByText('В очереди')).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Без группы, услуг: 1' }))
  expect(screen.queryByText(title)).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: 'Без группы, услуг: 1' }))
  fireEvent.press(screen.getByRole('button', { name: `Редактировать услугу ${title}` }))
  expect(mockPush).toHaveBeenCalledWith('/services/edit/s')
})
