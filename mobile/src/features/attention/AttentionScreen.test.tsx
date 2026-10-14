import React from 'react'
import { Alert, Modal, ScrollView, Text, View } from 'react-native'
import { act, fireEvent, render, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import AttentionScreen from './AttentionScreen'
import { TaskCard } from './TaskCard'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { useSyncRunState } from '../../shared/hooks/useSyncRunState'
import { performAttentionAction } from './actions'
import { selectAttention } from './selectors'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import type { Event } from '../../shared/domain/types'
import { useQuery } from '@tanstack/react-query'

jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'unit-user', tenantId: 'unit-tenant' } }) }))
jest.mock('../reviews/hooks', () => ({ useReviews: () => ({ data: { items: [], total: 0, allowClientReviews: false }, isPending: false }), useReviewStatuses: () => ({ data: {}, isPending: false }), useRefreshReviews: () => jest.fn() }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null, FontAwesome5: () => null }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
const mockInvalidate = jest.fn().mockResolvedValue(undefined)
jest.mock('@tanstack/react-query', () => ({ QueryClientContext: jest.requireActual('@tanstack/react-query').QueryClientContext, useQueryClient: () => ({ invalidateQueries: mockInvalidate }), useQuery: jest.fn() }))
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
  expect(ids).toEqual(['attention-section-closing', 'attention-section-overdue', 'attention-section-today', 'attention-section-tomorrow', 'attention-section-no-next-step', 'attention-section-sync', 'attention-section-upcoming', 'attention-section-dates'])
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
  expect(screen.getByText('15 сегодня')).toBeTruthy()
  expect(screen.getByTestId('attention-count-today')).toHaveTextContent('15')
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
  await act(async () => fireEvent.press(screen.getByLabelText('Выполнить задачу: Позвонить')))
  expect(performAttentionAction).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ _id: 't1' }) }), { type: 'complete' })
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cached-entities', 'events'] })
  jest.mocked(performAttentionAction).mockRejectedValueOnce(new Error('Не удалось сохранить задачу'))
  await act(async () => fireEvent.press(screen.getByLabelText('Выполнить задачу: Позвонить')))
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
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Уточнить'))
  fireEvent.press(screen.getByText('Редактировать'))
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
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Уточнить'))
  fireEvent.press(screen.getByText('Удалить'))
  expect(onAction).not.toHaveBeenLastCalledWith(item, { type: 'delete' })
  await act(async () => alert.mock.calls[0][2]![1].onPress!())
  expect(onAction).toHaveBeenLastCalledWith(item, { type: 'delete' })
  alert.mockRestore()
  const doneItem = { ...item, task: { ...item.task, done: true } }
  screen.rerender(<TaskCard item={doneItem} segment="tomorrow" busy={false} onAction={onAction} />)
  await act(async () => fireEvent.press(screen.getByLabelText('Отменить выполнение задачи: Уточнить')))
  expect(onAction).toHaveBeenLastCalledWith(doneItem, { type: 'undo' })
})
test('dark-токены и блокировка повторного нажатия', () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.today[0]
  const onAction = jest.fn()
  const screen = render(<ThemeProvider forcedMode="dark" storage={null}><TaskCard item={item} segment="today" busy onAction={onAction} /></ThemeProvider>)
  expect(screen.getByText('Договор')).toHaveStyle({ color: darkPalette.cardTitle })
  fireEvent.press(screen.getByLabelText('Выполнить задачу: Договор'))
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

test('ALIGN: прошедшая заявка и заявка без шага ведут в редактор, без автоматического изменения статуса', () => {
  fixtures.events = [
    { _id: 'past-draft', status: 'draft', eventType: 'Прошедшая заявка', eventDate: date(0) },
    { _id: 'no-step', status: 'draft', eventType: 'Нет контакта' },
  ]
  const screen = render(<AttentionScreen />)
  expect(screen.getByTestId('attention-section-past-requests')).toBeTruthy()
  fireEvent.press(screen.getByText('Отменить'))
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/events/edit/[id]', params: { id: 'past-draft', decision: 'canceled' } })
  fireEvent.press(screen.getByText('Закрыть'))
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/events/edit/[id]', params: { id: 'past-draft', decision: 'closed', section: 'finance' } })
  fireEvent.press(screen.getByText('Назначить контакт'))
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/events/edit/[id]', params: { id: 'no-step', section: 'contacts' } })
  expect(performAttentionAction).not.toHaveBeenCalled()
})

test.each([lightPalette, darkPalette])('секции и капсулы PWA, отдельные счётчики, тема $mode', (palette) => {
  const screen = render(<ThemeProvider forcedMode={palette.mode} storage={null}><AttentionScreen /></ThemeProvider>)
  expect(screen.queryByText('Задачи, оплаты и ближайшие даты')).toBeNull()
  expect(screen.getByTestId('attention-scroll').props.contentContainerStyle).toEqual(expect.objectContaining({ padding: 12, gap: 12 }))
  for (const segment of ['overdue', 'today', 'tomorrow'] as const) {
    expect(screen.getByTestId(`attention-section-${segment}`)).toHaveStyle({ borderWidth: 1, borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: palette.sectionAccent[segment] })
    expect(screen.getByTestId(`attention-count-${segment}`)).toHaveTextContent('1')
    expect(screen.getByTestId(`attention-summary-dot-${segment}`)).toHaveStyle({ width: 7, height: 7, backgroundColor: palette.sectionAccent[segment] })
  }
  expect(screen.getByTestId('attention-section-upcoming')).toHaveStyle({ borderLeftWidth: 3, borderLeftColor: palette.primary })
  expect(screen.getByTestId('attention-summary').props.horizontal).toBe(true)
  expect(screen.getByTestId('attention-summary').props.contentContainerStyle).toMatchObject({ flexDirection: 'row', gap: 6 })
  expect(screen.getByTestId('attention-summary').props.contentContainerStyle.flexWrap).toBeUndefined()
  expect(screen.getByText('1 просроч.')).toHaveStyle({ fontSize: 12, fontWeight: '700' })
  expect(screen.getByText('Сегодня')).toHaveStyle({ fontSize: 14, fontWeight: '600' })
  expect(screen.getByTestId('attention-summary-today')).toHaveStyle({ minHeight: 40 })
})

test('сводка в порядке PWA, прокрутка всех целей после вложенных layout и повторной раскладки', () => {
  fixtures.events.push({ _id: 'past-draft', status: 'draft', eventDate: date(0) }, { _id: 'no-step', status: 'draft' })
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined)
  const screen = render(<AttentionScreen />)
  const summary = within(screen.getByTestId('attention-summary'))
  const chips = summary.getAllByRole('button').map((node) => node.props.testID as string)
  expect(chips).toEqual(['attention-summary-overdue', 'attention-summary-today', 'attention-summary-tomorrow', 'attention-summary-closing', 'attention-summary-past-requests', 'attention-summary-no-next-step', 'attention-summary-dates'])
  chips.forEach((chip, index) => {
    const id = chip.replace('attention-summary-', '')
    fireEvent(screen.getByTestId(`attention-section-${id}`), 'layout', { nativeEvent: { layout: { y: 200 + index * 400 } } })
    fireEvent.press(screen.getByTestId(chip))
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 200 + index * 400, animated: true })
  })
  fireEvent(screen.getByTestId('attention-section-tomorrow'), 'layout', { nativeEvent: { layout: { y: 1600 } } })
  fireEvent.press(screen.getByTestId('attention-summary-tomorrow'))
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 1600, animated: true })
  expect(router.push).not.toHaveBeenCalled()
  scrollTo.mockRestore()
})

test.each(['past-requests', 'no-next-step'])('заявки %s: клиент → тип → дата, 5 + 10, полный счётчик и действия последней строки', (id) => {
  fixtures.events = Array.from({ length: 26 }, (_, i) => ({ _id: `request-${i}`, status: 'draft', clientId: 'c', eventType: `Тип ${i}`, eventDate: id === 'past-requests' ? date(0) : date(3) }))
  const screen = render(<AttentionScreen />)
  expect(screen.getByTestId(`attention-count-${id}`)).toHaveTextContent('26')
  const row = within(screen.getByTestId('attention-request-request-0'))
  const texts = row.UNSAFE_getAllByType(Text).map((node) => node.props.children)
  expect(texts[0]).toBe('Анна')
  expect(texts[1]).toBe('Тип 0')
  expect(texts[2]).toEqual(expect.stringMatching(/Дата работы:/))
  expect(screen.queryByTestId('attention-request-request-5')).toBeNull()
  expect(screen.getByTestId(`attention-show-all-${id}`)).toHaveTextContent('Показать ещё (21)')
  fireEvent.press(screen.getByTestId(`attention-show-all-${id}`))
  expect(screen.getByTestId('attention-request-request-14')).toBeTruthy()
  expect(screen.queryByTestId('attention-request-request-15')).toBeNull()
  fireEvent.press(screen.getByTestId(`attention-show-all-${id}`))
  expect(screen.getByTestId('attention-request-request-24')).toBeTruthy()
  expect(screen.queryByTestId('attention-request-request-25')).toBeNull()
  fireEvent.press(screen.getByTestId(`attention-show-all-${id}`))
  expect(screen.queryByTestId(`attention-show-all-${id}`)).toBeNull()
  fireEvent.press(within(screen.getByTestId('attention-request-request-25')).getByText('Открыть заявку'))
  expect(router.push).toHaveBeenLastCalledWith('/events/request-25')
  expect(performAttentionAction).not.toHaveBeenCalled()
  expect(screen.getByTestId('attention-request-actions-request-0')).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap' })
})

test('заявка сохраняет конец работы и перенос открывает редактор без мутации', () => {
  fixtures.events = [{ _id: 'ended', status: 'draft', eventDate: date(-2), dateEnd: date(0) }]
  const screen = render(<AttentionScreen />)
  expect(within(screen.getByTestId('attention-request-ended')).getByText(`Окончание работы: ${new Date(date(0)).toLocaleString('ru-RU')}`)).toBeTruthy()
  fireEvent.press(screen.getByText('Перенести дату'))
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/events/edit/[id]', params: { id: 'ended', section: 'general' } })
  expect(performAttentionAction).not.toHaveBeenCalled()
})

test.each([lightPalette, darkPalette])('значимая дата — нажимаемая строка с переносом текста и отдельной правой колонкой, $mode', (palette) => {
  const comment = 'Очень длинный комментарий '.repeat(20)
  fixtures.clients = [{ _id: 'specific-client', firstName: 'Анна', secondName: 'ДлиннаяФамилия'.repeat(10), significantDates: [{ title: 'Дата '.repeat(30), date: date(2), comment }] }]
  const screen = render(<ThemeProvider forcedMode={palette.mode} storage={null}><AttentionScreen /></ThemeProvider>)
  const row = screen.getByTestId('attention-client-date-specific-client:0')
  expect(row).toHaveStyle({ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 })
  expect(screen.getByTestId('attention-date-details-specific-client:0')).toHaveStyle({ flex: 1, minWidth: 0 })
  expect(screen.getByTestId('attention-date-deadline-specific-client:0')).toHaveStyle({ flexShrink: 0 })
  expect(screen.getByText(comment).props.numberOfLines).toBeUndefined()
  expect(screen.getByText(comment)).toHaveStyle({ fontSize: 12, color: palette.cardMuted })
  fireEvent.press(row)
  expect(router.push).toHaveBeenLastCalledWith('/clients/specific-client')
  expect(screen.queryByText('Открыть клиента')).toBeNull()
})

test.each([lightPalette, darkPalette])('задача выполнена: ✓, дата doneAt и зелёное оформление без зачёркивания, $mode', (palette) => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.overdue[0]
  const done = { ...item, task: { ...item.task, done: true, doneAt: date(1) } }
  const screen = render(<ThemeProvider forcedMode={palette.mode} storage={null}><TaskCard item={done} segment="overdue" busy={false} onAction={jest.fn()} /></ThemeProvider>)
  expect(screen.getByText('✓ Позвонить')).toHaveStyle({ fontSize: 14, color: palette.notice.success.text })
  expect(screen.getByText('✓ Позвонить')).not.toHaveStyle({ textDecorationLine: 'line-through' })
  expect(screen.getByTestId(`attention-item-${done.key}`)).toHaveStyle({ backgroundColor: palette.notice.success.background })
  expect(screen.getByText(`Выполнено: ${new Date(date(1)).toLocaleString('ru-RU')}`)).toBeTruthy()
  expect(screen.queryByText(new Date(date(0)).toLocaleString('ru-RU'))).toBeNull()
  screen.rerender(<ThemeProvider forcedMode={palette.mode} storage={null}><TaskCard item={{ ...done, task: { ...done.task, doneAt: null } }} segment="overdue" busy={false} onAction={jest.fn()} /></ThemeProvider>)
  expect(screen.getByText(`Выполнено: ${new Date(date(0)).toLocaleString('ru-RU')}`)).toBeTruthy()
})

test('меню задачи скрывает edit/delete, закрывается снаружи и Android Back, открывает работу', () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.today[0]
  const screen = render(<TaskCard item={item} segment="today" busy={false} onAction={jest.fn()} />)
  expect(screen.queryByText('Редактировать')).toBeNull()
  expect(screen.queryByText('Удалить')).toBeNull()
  const menu = screen.getByLabelText('Открыть меню задачи: Договор')
  expect(menu).toHaveStyle({ minHeight: 40, minWidth: 40 })
  fireEvent.press(menu)
  expect(screen.getByText('Редактировать')).toBeTruthy()
  fireEvent.press(screen.getByTestId('quick-actions-outside', { includeHiddenElements: true }))
  expect(screen.queryByText('Редактировать')).toBeNull()
  fireEvent.press(menu)
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose')
  expect(screen.queryByText('Удалить')).toBeNull()
  fireEvent.press(menu)
  fireEvent.press(screen.getByText('Открыть работу'))
  expect(router.push).toHaveBeenLastCalledWith('/events/e')
  expect(screen.queryByTestId('quick-actions-outside')).toBeNull()
})

test('busy блокирует выполнение, перенос, меню и открытый редактор; ошибка сохранения оставляет ввод', async () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.today[0]
  const onAction = jest.fn().mockResolvedValue(false)
  const screen = render(<TaskCard item={item} segment="today" busy={false} onAction={onAction} />)
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Договор'))
  fireEvent.press(screen.getByText('Редактировать'))
  fireEvent.changeText(screen.getByLabelText('Название задачи'), 'Сохранённый ввод')
  await act(async () => fireEvent.press(screen.getByText('Сохранить задачу')))
  expect(screen.getByLabelText('Название задачи').props.value).toBe('Сохранённый ввод')
  screen.rerender(<TaskCard item={item} segment="today" busy onAction={onAction} />)
  expect(screen.getByLabelText('Название задачи').props.editable).toBe(false)
  fireEvent.press(screen.getByText('Сохранить задачу'))
  fireEvent.press(screen.getByText('Отмена'))
  fireEvent.press(screen.getByLabelText('Выполнить задачу: Договор'))
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Договор'))
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Название задачи')).toBeTruthy()
  screen.rerender(<TaskCard item={item} segment="today" busy={false} onAction={onAction} />)
  fireEvent.press(screen.getByText('Отмена'))
  screen.rerender(<TaskCard item={item} segment="today" busy onAction={onAction} />)
  fireEvent.press(screen.getByText('На завтра'))
  expect(onAction).toHaveBeenCalledTimes(1)
})

test('задаток остаётся доступен через работу, без task-меню и выдуманных мутаций', () => {
  fixtures.events = [{ _id: 'deposit', status: 'active', waitDeposit: true, depositDueAt: date(0), depositExpectedAmount: 500 }]
  const screen = render(<AttentionScreen />)
  expect(screen.getByText('Просрочен задаток')).toBeTruthy()
  expect(screen.getByText('Ожидается: 500 ₽')).toBeTruthy()
  fireEvent.press(screen.getByText('Открыть оплату'))
  expect(router.push).toHaveBeenLastCalledWith('/events/deposit')
  expect(performAttentionAction).not.toHaveBeenCalled()
})

test('подсказки сохранены после разделения заголовка и счётчика', () => {
  fixtures.events = [{ _id: 'draft-past', status: 'draft', eventDate: date(0) }]
  const screen = render(<AttentionScreen />)
  for (const title of ['Заявки с прошедшей датой', 'Заявки без следующего шага']) {
    fireEvent.press(screen.getByLabelText(`Подсказка: ${title}`))
    expect(screen.getByTestId('field-help-panel')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Закрыть подсказку'))
  }
  expect(router.push).not.toHaveBeenCalled()
  expect(performAttentionAction).not.toHaveBeenCalled()
})

test('загрузка/ошибка очереди видна перед ближайшими; локальные операции видны при ошибке данных', () => {
  jest.mocked(useQuery).mockReturnValue({ isPending: true, refetch: mockRefetch } as never)
  const screen = render(<AttentionScreen />)
  expect(screen.getByLabelText('Загрузка очереди синхронизации')).toBeTruthy()
  jest.mocked(useQuery).mockReturnValue({ isError: true, data: { pendingCount: 4, issueCount: 2, outbox: { failed: 1, conflict: 1 } }, refetch: mockRefetch } as never)
  failed = true
  screen.rerender(<AttentionScreen />)
  expect(screen.getByText('Не удалось прочитать локальные данные обзора')).toBeTruthy()
  expect(screen.getByText('Не удалось прочитать очередь синхронизации')).toBeTruthy()
  expect(screen.getByText(/Ожидает: 4/)).toBeTruthy()
  expect(screen.getByText(/Конфликты: 1/)).toBeTruthy()
})

test('отмена удаления не меняет задачу, подтверждение требует одно действие', async () => {
  const item = selectAttention(fixtures.events as Event[], [], [], now).groups.today[0]
  const onAction = jest.fn().mockResolvedValue(true)
  const alert = jest.spyOn(Alert, 'alert')
  const screen = render(<TaskCard item={item} segment="today" busy={false} onAction={onAction} />)
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Договор'))
  fireEvent.press(screen.getByText('Удалить'))
  expect(alert).toHaveBeenLastCalledWith('Удалить задачу?', 'Договор', expect.any(Array))
  expect(onAction).not.toHaveBeenCalled()
  expect(alert.mock.calls[0][2]![0].style).toBe('cancel')
  await act(async () => alert.mock.calls[0][2]![1].onPress!())
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction).toHaveBeenCalledWith(item, { type: 'delete' })
  alert.mockRestore()
})

test('во время сохранения действия открытого меню заблокированы, повтор команды не записывается', async () => {
  let finish: () => void = () => undefined
  jest.mocked(performAttentionAction).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const screen = render(<AttentionScreen />)
  fireEvent.press(screen.getByLabelText('Открыть меню задачи: Позвонить'))
  await act(async () => fireEvent.press(screen.getByLabelText('Выполнить задачу: Договор')))
  fireEvent.press(screen.getByText('Редактировать'))
  fireEvent.press(screen.getByText('Удалить'))
  expect(screen.queryByLabelText('Название задачи')).toBeNull()
  fireEvent.press(screen.getByLabelText('Выполнить задачу: Договор'))
  expect(performAttentionAction).toHaveBeenCalledTimes(1)
  await act(async () => finish())
})
