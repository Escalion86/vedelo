import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react-native'
import { Button } from '../../shared/ui/components'
import { EventsScopeProvider, useEventsScope } from '../navigation/EventsScope'
import EventsScreen from '../../../app/(tabs)/events'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы', accusative: 'заказ' }) }))
jest.mock('../events/EventCalendar', () => ({ EventCalendar: () => null }))
jest.mock('../events/MobileEventCard', () => ({ MobileEventCard: ({ event }: { event: { _id: string } }) => {
  const { Text } = require('react-native')
  return <Text>{`Работа ${event._id}`}</Text>
} }))
const refetch = jest.fn()
let events: object[] = []
let error = false
function Entry() {
  const { selectScope } = useEventsScope()
  return <><Button title="Вход из Важного" onPress={() => selectScope('past', true)} /><Button title="Вход из меню" onPress={() => selectScope('past')} /><EventsScreen /></>
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: new Date(2026, 9, 1, 12) })
  error = false
  events = [
    { _id: 'finished', status: 'active', eventDate: '2000-01-01' },
    { _id: 'closed', status: 'closed', eventDate: '2000-01-01' },
    { _id: 'canceled', status: 'canceled', eventDate: '2000-01-01' },
    { _id: 'ongoing', status: 'active', eventDate: '2000-01-01', dateEnd: '2099-01-01' },
    { _id: 'transferred', status: 'active', eventDate: '2000-01-01', isTransferred: true },
  ]
  jest.mocked(useCachedEntities).mockImplementation((entity) => ({ data: entity === 'events' ? events : [], error: error ? new Error('Read') : null, isError: error, isPending: false, isFetching: false, refetch } as never))
})
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers() })
test('переход фильтрует завершённые по dateEnd, отменённые/закрытые/переданные исключены; меню сбрасывает preset', () => {
  const screen = render(<EventsScopeProvider><Entry /></EventsScopeProvider>)
  fireEvent.press(screen.getByText('Вход из Важного'))
  expect(screen.getByText('Работа finished')).toBeTruthy()
  for (const id of ['closed', 'canceled', 'ongoing', 'transferred']) expect(screen.queryByText(`Работа ${id}`)).toBeNull()
  fireEvent.press(screen.getByText('Вход из меню'))
  expect(screen.getByText('Работа closed')).toBeTruthy()
  expect(screen.queryByText('Не закрыто · Сбросить фильтр')).toBeNull()
})
test('пустой фильтр предлагает сброс, а ошибка чтения — повтор', () => {
  events = []
  const screen = render(<EventsScopeProvider><Entry /></EventsScopeProvider>)
  fireEvent.press(screen.getByText('Вход из Важного'))
  expect(screen.getByText('Незакрытых работ не найдено')).toBeTruthy()
  fireEvent.press(screen.getByText('Сбросить фильтр'))
  expect(screen.queryByText('Незакрытых работ не найдено')).toBeNull()
  error = true
  screen.rerender(<EventsScopeProvider><Entry /></EventsScopeProvider>)
  expect(screen.getByText('Не удалось прочитать список работ')).toBeTruthy()
  expect(screen.queryByText('Здесь пока пусто')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение'))
  expect(refetch).toHaveBeenCalledTimes(1)
})
