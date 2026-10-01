import React from 'react'
import { Button, FlatList, Modal } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import EventsScreen from '../../../app/(tabs)/events'
import { EventsScopeProvider, useEventsScope } from '../navigation/EventsScope'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import type { ListEvent } from './filters'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы', accusative: 'заказ' }) }))
jest.mock('./MobileEventCard', () => ({ MobileEventCard: ({ event, testID }: { event: ListEvent; testID: string }) => {
  const { Text } = require('react-native')
  return <Text testID={testID}>{event.eventType}</Text>
} }))
const mockQuery = { data: [] as ListEvent[], isError: false, isPending: false, isFetching: false, refetch: jest.fn(), refresh: jest.fn() }
const mockRelated = { data: [], isError: false, isPending: false, isFetching: false, refetch: jest.fn() }
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (kind: string) => kind === 'events' ? mockQuery : mockRelated }))
const Switch = () => {
  const { selectScope } = useEventsScope()
  return <><Button title="Перейти к прошедшим" onPress={() => selectScope('past')} />
    <Button title="Перейти к незакрытым" onPress={() => selectScope('past', true)} /></>
}
const setup = () => render(<ThemeProvider storage={null}><EventsScopeProvider><Switch /><EventsScreen /></EventsScopeProvider></ThemeProvider>)
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00+07:00'))
  jest.clearAllMocks()
  Object.assign(mockQuery, { data: [], isError: false, isPending: false })
})
afterEach(() => jest.useRealTimers())
const future: ListEvent = { _id: 'future', eventType: 'Будущий заказ', status: 'active', eventDate: '2026-10-02T12:00:00+07:00', calendarImportChecked: true, address: { town: 'Москва' } }
it('scope comes from navigation; unclosed shortcut, filter selection/reset and Back', () => {
  mockQuery.data = [future, { ...future, _id: 'past', eventType: 'Прошедший заказ', eventDate: '2026-09-01' }, { ...future, _id: 'closed', eventType: 'Закрытый заказ', status: 'closed', eventDate: '2026-09-01' }]
  const screen = setup()
  expect(screen.getByText('Будущий заказ')).toBeTruthy()
  expect(screen.queryByText('Прошедший заказ')).toBeNull()
  fireEvent.press(screen.getByText('Перейти к незакрытым'))
  expect(screen.getByText('Прошедший заказ')).toBeTruthy()
  expect(screen.queryByText('Закрытый заказ')).toBeNull()
  fireEvent.press(screen.getByTestId('events-filters-trigger'))
  expect(screen.getByRole('button', { name: 'Нужно закрыть' }).props.accessibilityState.selected).toBe(true)
  fireEvent.press(screen.getByRole('button', { name: 'Сбросить фильтры' }))
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
  expect(screen.getByText('Закрытый заказ')).toBeTruthy()
  expect(screen.queryByTestId('events-filters')).toBeNull()
})
it('overlay and mode/day changes keep list mounted and applied filters', () => {
  mockQuery.data = [future, { ...future, _id: 'other', eventType: 'Другой город', address: { town: 'Красноярск' } }]
  const screen = setup()
  const list = screen.UNSAFE_getAllByType(FlatList)[0]
  fireEvent.scroll(screen.getByTestId('events-list-rows'), { nativeEvent: { contentOffset: { y: 300, x: 0 }, contentSize: { height: 1000, width: 390 }, layoutMeasurement: { width: 390, height: 400 } } })
  fireEvent.press(screen.getByTestId('events-filters-trigger'))
  expect(screen.getByTestId('events-filters')).toHaveStyle({ position: 'absolute' })
  fireEvent.press(screen.getByRole('button', { name: 'Москва' }))
  fireEvent.press(screen.getByTestId('events-filters-outside', { includeHiddenElements: true }))
  expect(screen.queryByText('Другой город')).toBeNull()
  fireEvent.press(screen.getByTestId('events-view-calendar'))
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-02'))
  expect(screen.getByText('Будущий заказ')).toBeTruthy()
  expect(screen.queryByText('Другой город')).toBeNull()
  fireEvent.press(screen.getByTestId('events-view-list'))
  expect(screen.UNSAFE_getAllByType(FlatList)[0]).toBe(list)
  expect(screen.getByTestId('events-filters-trigger').props.accessibilityState.selected).toBe(true)
  expect(screen.getByText('Будущий заказ')).toBeTruthy()
})
it('distinguishes no data, no matches and read error; past never forces creation', () => {
  const screen = setup()
  fireEvent.press(screen.getByText('Создать заявку'))
  expect(router.push).toHaveBeenCalledWith('/events/edit/new')
  fireEvent.press(screen.getByText('Перейти к прошедшим'))
  expect(screen.queryByText('Создать заявку')).toBeNull()
  expect(screen.getByText('Прошедших пока нет')).toBeTruthy()
  screen.unmount()
  mockQuery.data = [future]
  const filtered = setup()
  fireEvent.press(filtered.getByTestId('events-filters-trigger'))
  fireEvent.press(filtered.getByRole('button', { name: 'Не проверено' }))
  fireEvent.press(filtered.getByTestId('events-filters-outside', { includeHiddenElements: true }))
  expect(filtered.getByText('Ничего не найдено')).toBeTruthy()
  fireEvent.press(filtered.getByText('Сбросить фильтры'))
  expect(filtered.getByText('Будущий заказ')).toBeTruthy()
  filtered.unmount()
  mockQuery.isError = true
  mockQuery.data = []
  const failed = setup()
  expect(failed.queryByText('Здесь пока пусто')).toBeNull()
  expect(failed.queryByText('Создать заявку')).toBeNull()
  fireEvent.press(failed.getByText('Повторить чтение'))
  expect(mockQuery.refetch).toHaveBeenCalledTimes(1)
})
it('refreshes scope on time boundary while screen stays open', () => {
  mockQuery.data = [{ ...future, eventDate: '2026-10-01T12:00:01+07:00' }]
  const screen = setup()
  expect(screen.getByText('Будущий заказ')).toBeTruthy()
  act(() => jest.advanceTimersByTime(30_000))
  expect(screen.queryByText('Будущий заказ')).toBeNull()
})
