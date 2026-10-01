import React from 'react'
import { Modal } from 'react-native'
import { act, fireEvent, render, within } from '@testing-library/react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { MobileBottomBar } from './MobileBottomBar'
import { EventsScopeProvider } from './EventsScope'
import { countOverdueTasks } from './bottomBar'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import EventsScreen from '../../../app/(tabs)/events'
import type { Event } from '../../shared/domain/types'

const mockNavigate = jest.fn()
const mockPush = jest.fn()
let mockPath = '/events'
let mockAllowAi = true
let mockOnline = true
const mockEvents: Event[] = [
  { _id: 'future', status: 'active', eventDate: '2099-01-01', description: 'Будущая работа' },
  { _id: 'past', status: 'active', eventDate: '2000-01-01', description: 'Прошлая работа', additionalEvents: [{ date: '2000-01-01', done: false }] },
]
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ router: {
  navigate: (href: unknown) => mockNavigate(href), push: (href: unknown) => mockPush(href),
}, usePathname: () => mockPath, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }))
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ pluralCapitalized: 'Заказы', accusative: 'заказ' }) }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: (type: string) => ({ data: type === 'events' ? mockEvents : [], isFetching: false }) }))
jest.mock('./MenuSheet', () => {
  const { Text } = require('react-native')
  return { MenuSheet: () => <Text>Каталог меню</Text> }
})
jest.mock('../events/useAiDraftAccess', () => ({ useAiDraftAccess: () => ({ allowAi: mockAllowAi, online: mockOnline }) }))
jest.mock('../events/EventCalendar', () => ({ EventCalendar: () => null }))
jest.mock('../events/MobileEventCard', () => {
  const { Text } = require('react-native')
  return { MobileEventCard: ({ event }: { event: Event }) => <Text>{event.description}</Text> }
})

const props = (name = 'index') => ({
  state: { key: 'tabs', index: ['index', 'events', 'clients', 'finance', 'more', 'tasks', 'profile'].indexOf(name),
    routes: ['index', 'events', 'clients', 'finance', 'more', 'tasks', 'profile'].map((route) => ({ key: route, name: route })) },
  navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
} as unknown as BottomTabBarProps)
const shell = (barProps: BottomTabBarProps, mode: 'light' | 'dark' = 'light', withList = false) =>
  <ThemeProvider forcedMode={mode} storage={null}><EventsScopeProvider>
    {withList ? <EventsScreen /> : null}<MobileBottomBar {...barProps} />
  </EventsScopeProvider></ThemeProvider>

beforeEach(() => { jest.clearAllMocks(); mockPath = '/events'; mockAllowAi = true; mockOnline = true })

it('ровно пять слотов; finance/tasks/profile/more не добавляют видимые вкладки', () => {
  const barProps = props()
  const screen = render(shell(barProps))
  expect(screen.getAllByTestId(/^bottom-slot-/).map((node) => node.props.accessibilityLabel))
    .toEqual(['Важное', 'Заказы', 'Создать', 'Клиенты', 'Меню'])
  expect(screen.queryByText('Финансы')).toBeNull()
  fireEvent.press(screen.getByTestId('bottom-slot-clients'))
  expect(barProps.navigation.navigate).toHaveBeenCalledWith('clients')
  fireEvent.press(screen.getByTestId('bottom-slot-attention'))
  expect(barProps.navigation.navigate).toHaveBeenCalledWith('index')
  expect(within(screen.getByTestId('bottom-slot-attention')).getByText('1')).toBeTruthy()
})

it('одна панель: повторный тап, затемнение, Android Back и смена маршрута закрывают её', () => {
  const barProps = props()
  const screen = render(shell(barProps))
  fireEvent.press(screen.getByTestId('bottom-slot-events'))
  expect(screen.getByText('Предстоящие')).toBeTruthy()
  fireEvent.press(screen.getByTestId('bottom-slot-menu'))
  expect(screen.queryByText('Предстоящие')).toBeNull()
  expect(screen.getByText('Каталог меню')).toBeTruthy()
  fireEvent.press(screen.getByTestId('bottom-slot-menu'))
  expect(screen.queryByText('Каталог меню')).toBeNull()
  fireEvent.press(screen.getByTestId('bottom-slot-menu'))
  fireEvent.press(screen.getByTestId('navigation-backdrop'))
  expect(screen.queryByText('Каталог меню')).toBeNull()
  fireEvent.press(screen.getByTestId('bottom-slot-menu'))
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
  expect(screen.queryByText('Каталог меню')).toBeNull()
  fireEvent.press(screen.getByTestId('bottom-slot-menu'))
  mockPath = '/clients'
  screen.rerender(shell(props('clients')))
  expect(screen.queryByText('Каталог меню')).toBeNull()
})

it('подменю переключает реальный список, временное меню сохраняет выбранный фильтр', () => {
  jest.useFakeTimers()
  const screen = render(shell(props('events'), 'light', true))
  try {
    expect(screen.getByText('Будущая работа')).toBeTruthy()
    expect(screen.queryByText('Прошлая работа')).toBeNull()
    fireEvent.press(screen.getByTestId('bottom-slot-events'))
    fireEvent.press(within(screen.UNSAFE_getAllByType(Modal).find((modal) => modal.props.visible)!).getByRole('button', { name: 'Прошедшие' }))
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/events')
    expect(screen.getByText('Прошлая работа')).toBeTruthy()
    expect(screen.queryByText('Будущая работа')).toBeNull()
    fireEvent.press(screen.getByTestId('events-filters-trigger'))
    fireEvent.press(screen.getByRole('button', { name: 'Без передачи коллеге' }))
    fireEvent.press(screen.getByTestId('events-filters-outside', { includeHiddenElements: true }))
    fireEvent.press(screen.getByTestId('bottom-slot-menu'))
    fireEvent.press(screen.getByTestId('navigation-backdrop'))
    expect(screen.getByText('Прошлая работа')).toBeTruthy()
    expect(screen.queryByText('Будущая работа')).toBeNull()
    expect(screen.getByTestId('events-filters-trigger').props.accessibilityState.selected).toBe(true)
    act(() => { jest.runOnlyPendingTimers() })
  } finally {
    screen.unmount()
    jest.useRealTimers()
  }
})

it.each(['draft', 'active', 'voice', 'text'] as const)('центральное меню передаёт режим %s редактору', (choice) => {
  const titles = { draft: 'Заявка', active: 'Подтверждено', voice: 'Голосом', text: 'Свободным текстом' }
  const screen = render(shell(props()))
  fireEvent.press(screen.getByTestId('bottom-slot-create'))
  fireEvent.press(screen.getByText(titles[choice]))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit/new', params: {
    initialStatus: choice === 'active' ? 'active' : 'draft', mode: ['voice', 'text'].includes(choice) ? choice : 'manual',
  } })
  expect(screen.queryByText('Свободным текстом')).toBeNull()
})

it('ручное создание доступно offline, ИИ скрыт без тарифа и заблокирован без сети', () => {
  mockAllowAi = false
  const screen = render(shell(props()))
  fireEvent.press(screen.getByTestId('bottom-slot-create'))
  expect(screen.queryByText('Голосом')).toBeNull()
  mockAllowAi = true
  mockOnline = false
  screen.rerender(shell(props()))
  expect(screen.getByRole('button', { name: 'Голосом' })).toBeDisabled()
  fireEvent.press(screen.getByText('Голосом'))
  expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Заявка'))
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it.each(['light', 'dark'] as const)('нижняя панель использует тему %s, safe area и выделяет Меню в финансах', (mode) => {
  mockPath = '/finance'
  const palette = mode === 'light' ? lightPalette : darkPalette
  const screen = render(shell(props('finance'), mode))
  expect(screen.getByTestId('mobile-bottom-bar')).toHaveStyle({ backgroundColor: palette.navigationBackground, paddingBottom: 16 })
  expect(screen.getByTestId('bottom-slot-menu').props.accessibilityState.selected).toBe(true)
  expect(screen.getByText('Меню')).toHaveStyle({ color: palette.navigationActive, fontSize: 10, lineHeight: 12 })
  expect(screen.getByTestId('bottom-slot-menu')).toHaveStyle({ minHeight: 60 })
})

it('бейдж считает только незавершённые просроченные контакты, включая сегодняшний', () => {
  const now = new Date('2026-10-01T12:00:00Z')
  expect(countOverdueTasks([{ _id: '1', status: 'active', additionalEvents: [
    { date: '2026-10-01T11:59:00Z', done: false }, { date: '2026-09-01', done: true },
    { date: '2026-10-02', done: false }, { date: 'invalid' }, {}, { date: now.toISOString() },
  ] }], now)).toBe(1)
})
