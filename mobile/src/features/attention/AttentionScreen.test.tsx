import React from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import AttentionScreen from './AttentionScreen'
import { TaskCard } from './TaskCard'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { useSyncRunState } from '../../shared/hooks/useSyncRunState'
import { performAttentionAction } from './actions'
import { selectAttention } from './selectors'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette } from '../../shared/ui/theme'
import type { Event } from '../../shared/domain/types'
import { useQuery } from '@tanstack/react-query'

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
const mockInvalidate = jest.fn().mockResolvedValue(undefined)
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }), useQuery: jest.fn() }))
jest.mock('../../shared/hooks/useCachedEntities', () => ({ useCachedEntities: jest.fn() }))
jest.mock('../../shared/hooks/useSyncRunState', () => ({ useSyncRunState: jest.fn() }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ labelCapitalized: 'Заказ', accusative: 'заказ', pluralCapitalized: 'Заказы', pluralGenitive: 'заказов' }) }))
jest.mock('../../shared/sync/syncState', () => ({ getSyncQueueCounts: jest.fn() }))
jest.mock('../../shared/storage/outbox', () => ({ getOutboxSummary: jest.fn() }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('./actions', () => ({ ...jest.requireActual('./actions'), performAttentionAction: jest.fn() }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: jest.fn() }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: jest.fn() }))
const mockSelectScope = jest.fn()
jest.mock('../navigation/EventsScope', () => ({ useEventsScope: () => ({ selectScope: mockSelectScope }) }))
const now = new Date(2026, 9, 1, 12)
const date = (day: number) => new Date(2026, 9, day, 15).toISOString()
const mockRefetch = jest.fn()
let fixtures: Record<string, object[]>
let failed = false
let pending = false
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now })
  failed = false
  pending = false
  fixtures = { events: [
    { _id: 'e', status: 'active', eventType: 'Свадьба', eventDate: date(2), address: { town: 'Томск', street: 'Мира' }, additionalEvents: [
      { _id: 't1', title: 'Позвонить', date: date(0) }, { _id: 't2', title: 'Договор', date: date(1) }, { _id: 't3', title: 'Уточнить', date: date(2) },
    ] }, { _id: 'past', status: 'active', eventDate: date(0) },
  ], clients: [{ _id: 'c', firstName: 'Анна', significantDates: [{ title: 'День рождения', date: '2000-10-02T12:00:00', comment: 'Поздравить' }] }], transactions: [], services: [] }
  jest.mocked(useCachedEntities).mockImplementation((entity) => ({ data: fixtures[entity], isError: failed, isPending: pending, refetch: mockRefetch } as never))
  jest.mocked(useQuery).mockReturnValue({ data: { pendingCount: 2, issueCount: 1, outbox: { failed: 1 } }, refetch: mockRefetch } as never)
  jest.mocked(useSyncRunState).mockReturnValue({ status: 'offline', issueCount: 1, consecutiveFailures: 0 })
  jest.mocked(performAttentionAction).mockResolvedValue(undefined)
})
afterEach(() => { jest.useRealTimers() })

test('порядок секций, полноценные карточки, без выдуманных сообщений и финансов месяца', () => {
  const screen = render(<AttentionScreen />)
  const ids = screen.UNSAFE_getAllByType(View).map((node) => node.props.testID).filter((id) => id?.startsWith('attention-section-'))
  expect(ids).toEqual(['attention-section-closing', 'attention-section-overdue', 'attention-section-today', 'attention-section-tomorrow', 'attention-section-upcoming', 'attention-section-dates', 'attention-section-sync'])
  expect(screen.getByTestId('attention-event-e')).toBeTruthy()
  expect(screen.getByText('Закрытие заказов')).toBeTruthy()
  expect(screen.queryByText('Финансы месяца')).toBeNull()
  expect(screen.queryByText(/сообщений/i)).toBeNull()
  expect(screen.getByText('Нет сети')).toBeTruthy()
})
test('summary прокручивает к секции, закрытие только открывает past с фильтром', () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined)
  const screen = render(<AttentionScreen />)
  fireEvent(screen.getByTestId('attention-section-tomorrow'), 'layout', { nativeEvent: { layout: { y: 800 } } })
  fireEvent.press(screen.getByTestId('attention-summary-tomorrow'))
  expect(scrollTo).toHaveBeenCalledWith({ y: 800, animated: true })
  expect(router.push).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Открыть незакрытые'))
  expect(mockSelectScope).toHaveBeenCalledWith('past', true)
  expect(router.push).toHaveBeenCalledWith('/(tabs)/events')
  expect(performAttentionAction).not.toHaveBeenCalled()
  scrollTo.mockRestore()
})
test('доступ ко всем задачам сверх 12, полный счётчик', () => {
  fixtures.events = [{ _id: 'e', status: 'active', additionalEvents: Array.from({ length: 15 }, (_, i) => ({ _id: String(i), title: `Задача ${i}`, date: date(1) })) }]
  const screen = render(<AttentionScreen />)
  expect(screen.getAllByText('Сегодня · 15')).toHaveLength(2)
  expect(screen.queryByText('Задача 14')).toBeNull()
  fireEvent.press(screen.getByTestId('attention-show-all-today'))
  expect(screen.getByText('Задача 14')).toBeTruthy()
})
test('пустой cache предлагает создание и тексты трёх секций', () => {
  fixtures = { events: [], clients: [], transactions: [], services: [] }
  const screen = render(<AttentionScreen />)
  expect(screen.getByText('Здесь пока нет работ')).toBeTruthy()
  expect(screen.getByText('Просроченных задач нет')).toBeTruthy()
  expect(screen.getByText('На сегодня задач нет')).toBeTruthy()
  expect(screen.getByText('На завтра задач нет')).toBeTruthy()
  expect(screen.queryByTestId('attention-summary')).toBeNull()
  fireEvent.press(screen.getByText('Новая заявка'))
  expect(router.push).toHaveBeenCalledWith('/events/edit/new')
})
test('ошибка чтения отличается от пустого состояния, есть retry', () => {
  failed = true
  const screen = render(<AttentionScreen />)
  expect(screen.getByText('Не удалось прочитать локальные данные обзора')).toBeTruthy()
  expect(screen.queryByText('Здесь пока нет работ')).toBeNull()
  expect(screen.queryByTestId('attention-summary')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение'))
  expect(mockRefetch).toHaveBeenCalledTimes(4)
})
test('загрузка не показывает пустой cache', () => {
  pending = true
  const screen = render(<AttentionScreen />)
  expect(screen.getByLabelText('Загрузка обзора')).toBeTruthy()
  expect(screen.queryByText('Здесь пока нет работ')).toBeNull()
})
test('действие обновляет query; ошибка не выдаётся за успех', async () => {
  const screen = render(<AttentionScreen />)
  await act(async () => fireEvent.press(screen.getAllByText('Выполнено')[0]))
  expect(performAttentionAction).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ _id: 't1' }) }), { type: 'complete' })
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cached-entities', 'events'] })
  jest.mocked(performAttentionAction).mockRejectedValueOnce(new Error('Не удалось сохранить задачу'))
  await act(async () => fireEvent.press(screen.getAllByText('Выполнено')[0]))
  expect(screen.getByText('Не удалось сохранить задачу')).toBeTruthy()
})
test('tasks и index используют одну реализацию', () => {
  expect(require('../../../app/(tabs)/tasks').default).toBe(AttentionScreen)
  expect(require('../../../app/(tabs)/index').default).toBe(AttentionScreen)
})
test('редактор валидирует, сегментный перенос, удаление с подтверждением, undo', async () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.tomorrow[0]
  const onAction = jest.fn().mockResolvedValue(true)
  const screen = render(<TaskCard item={item} segment="tomorrow" busy={false} onAction={onAction} />)
  expect(screen.queryByText('На завтра')).toBeNull()
  await act(async () => fireEvent.press(screen.getByText('На +2 дня')))
  expect(onAction).toHaveBeenCalledWith(item, { type: 'postpone', days: 3 })
  fireEvent.press(screen.getByText('Изменить'))
  fireEvent.changeText(screen.getByLabelText('Название задачи'), '')
  await act(async () => fireEvent.press(screen.getByText('Сохранить задачу')))
  expect(screen.getByText('Введите название задачи')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Название задачи'), 'Новый контакт')
  fireEvent.changeText(screen.getByLabelText('Срок (ГГГГ-ММ-ДД ЧЧ:ММ)'), '2026-02-30 10:00')
  await act(async () => fireEvent.press(screen.getByText('Сохранить задачу')))
  expect(screen.getByText(/Введите дату в формате/)).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Срок (ГГГГ-ММ-ДД ЧЧ:ММ)'), '')
  await act(async () => fireEvent.press(screen.getByText('Сохранить задачу')))
  expect(onAction).toHaveBeenLastCalledWith(item, expect.objectContaining({ type: 'edit', title: 'Новый контакт', date: null }))
  const alert = jest.spyOn(Alert, 'alert')
  fireEvent.press(screen.getByText('Удалить'))
  expect(onAction).not.toHaveBeenLastCalledWith(item, { type: 'delete' })
  await act(async () => alert.mock.calls[0][2]![1].onPress!())
  expect(onAction).toHaveBeenLastCalledWith(item, { type: 'delete' })
  alert.mockRestore()
  const doneItem = { ...item, task: { ...item.task, done: true } }
  screen.rerender(<TaskCard item={doneItem} segment="tomorrow" busy={false} onAction={onAction} />)
  await act(async () => fireEvent.press(screen.getByText('Отменить выполнение')))
  expect(onAction).toHaveBeenLastCalledWith(doneItem, { type: 'undo' })
})
test('dark-токены и блокировка повторного нажатия', () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.today[0]
  const onAction = jest.fn()
  const screen = render(<ThemeProvider forcedMode="dark" storage={null}><TaskCard item={item} segment="today" busy onAction={onAction} /></ThemeProvider>)
  expect(screen.getByText('Договор')).toHaveStyle({ color: darkPalette.cardTitle })
  fireEvent.press(screen.getByText('Выполнено'))
  expect(onAction).not.toHaveBeenCalled()
})
test('sync-секция исчезает при пустой очереди и возвращается при ошибке чтения', () => {
  jest.mocked(useQuery).mockReturnValue({ data: { pendingCount: 0, issueCount: 0, outbox: {} }, refetch: mockRefetch } as never)
  jest.mocked(useSyncRunState).mockReturnValue({ status: 'success', issueCount: 0, consecutiveFailures: 0 })
  const screen = render(<AttentionScreen />)
  expect(screen.queryByTestId('attention-section-sync')).toBeNull()
  jest.mocked(useQuery).mockReturnValue({ isError: true, refetch: mockRefetch } as never)
  screen.rerender(<AttentionScreen />)
  expect(screen.getByText('Не удалось прочитать очередь синхронизации')).toBeTruthy()
  fireEvent.press(screen.getByText('Повторить чтение очереди'))
  expect(mockRefetch).toHaveBeenCalledTimes(1)
})
test('sync сохраняет переход к подробностям и штатный повтор', async () => {
  const screen = render(<AttentionScreen />)
  fireEvent.press(screen.getByText('Открыть состояние синхронизации'))
  expect(router.push).toHaveBeenCalledWith('/sync')
  await act(async () => fireEvent.press(screen.getByText('Повторить синхронизацию')))
  expect(require('../../shared/sync/syncEngine').runSync).toHaveBeenCalledTimes(1)
})
