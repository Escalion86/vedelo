import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Linking, StyleSheet } from 'react-native'
import Screen from '../../../app/calls/[id]'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockGet = jest.fn(); const mockPost = jest.fn(); const mockList = jest.fn(); const mockCache = jest.fn(); const mockSync = jest.fn(); const mockPush = jest.fn(); const mockDispatch = jest.fn()
let mockParams: any; let mockCall: any; let mockEntities: Record<string, any[]>; let mockFocus = 0; let mockPrevented = false; let mockBack: any
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn, mockFocus]), useNavigation: () => ({ dispatch: mockDispatch }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (value: boolean, callback: any) => { mockPrevented = value; mockBack = callback } }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ labelCapitalized: 'Заказ' }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), post: (...args: any[]) => mockPost(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: (...args: any[]) => mockList(...args), getCachedEntity: (...args: any[]) => mockCache(...args) }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: (...args: any[]) => mockSync(...args) }))
const id = '111111111111111111111111'; const clientId = '222222222222222222222222'; const eventId = '333333333333333333333333'; const otherId = '444444444444444444444444'
const client = { _id: clientId, firstName: 'Имя '.repeat(60), phone: 79991112233 }
const event = { _id: eventId, clientId, eventType: 'Фотосъёмка', additionalEvents: [] }
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider storage={null} forcedMode={mode}><Screen /></ThemeProvider>
const confirm = async () => { const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2]; await act(async () => buttons.find((button: any) => button.text === 'Подтвердить').onPress()) }
beforeEach(() => {
  jest.clearAllMocks(); mockFocus = 0; mockParams = { id }; mockCall = { _id: id, status: 'new', direction: 'incoming', phone: '+79991112233', durationSec: 75, callResultNote: 'Исходная заметка', updatedAt: '2026-10-03T03:00:00Z', transcript: 'Длинный транскрипт '.repeat(60), aiExtractedFields: { eventCity: 'Красноярск', budget: 1000 } }
  mockEntities = { clients: [{ ...client }], events: [{ ...event, additionalEvents: [] }] }; mockGet.mockImplementation(async () => ({ success: true, data: { ...mockCall } })); mockList.mockImplementation(async (kind: string) => mockEntities[kind]); mockCache.mockImplementation(async (kind: string, value: string) => mockEntities[kind].find((item) => item._id === value) || null); mockSync.mockResolvedValue({})
  mockPost.mockImplementation(async (path: string, body: any) => {
    if (path.endsWith('/link')) mockCall = { ...mockCall, status: 'linked', ...(body.clientId ? { linkedClientId: body.clientId } : {}), ...(body.eventId ? { linkedEventId: body.eventId } : {}) }
    if (path.endsWith('/ignore')) mockCall = { ...mockCall, status: 'ignored' }
    if (path.endsWith('/result')) {
      mockCall = { ...mockCall, callResult: body.result, callResultNote: body.note.trim() }
      if (body.nextContactAt) { const task = { _id: otherId, date: body.nextContactAt, title: 'Следующий контакт', description: body.note, done: false }; mockEntities.events[0]?.additionalEvents.push(task); return { success: true, data: { call: { ...mockCall }, event: { _id: eventId }, task } } }
    }
    if (path.endsWith('/analyze')) mockCall = { ...mockCall, aiSummary: 'Итог', status: 'ready' }
    if (path.endsWith('/process-recording')) mockCall = { ...mockCall, transcript: 'Распознано', status: 'ready' }
    if (path.endsWith('/decision')) { mockCall = { ...mockCall, status: 'linked', eventDecision: body.decision === 'create_event' ? 'created' : 'no_event', ...(body.decision === 'create_event' ? { linkedEventId: eventId } : {}) }; return { success: true, data: { call: { ...mockCall }, event: body.decision === 'create_event' ? { _id: eventId, clientId } : null } } }
    return { success: true, data: { ...mockCall } }
  })
  jest.spyOn(Alert, 'alert').mockImplementation(() => {}); jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())
it.each(['light', 'dark'] as const)('Y: call %s, transcript/AI fields и compact result', async (mode) => {
  const screen = render(draw(mode)); await screen.findByText(mockCall.transcript)
  expect(StyleSheet.flatten(screen.getByText(mockCall.transcript).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByLabelText('Комментарий').props.value).toBe('Исходная заметка'); expect(screen.getByText('Город: Красноярск')).toBeTruthy(); expect(screen.getByText('Бюджет: 1000 ₽')).toBeTruthy()
})
it('Y: call/cache errors независимы, retry без сообщения отсутствия', async () => {
  mockList.mockRejectedValue(new Error('cache secret')); const screen = render(draw()); await screen.findByText(mockCall.transcript)
  await screen.findByText('Не удалось прочитать клиентов. Связи с клиентом недоступны.'); expect(screen.queryByText('Привязать найденного клиента')).toBeNull(); expect(screen.queryByText('Фотосъёмка · Дата не указана')).toBeNull()
  mockGet.mockRejectedValueOnce(Object.assign(new Error('secret'), { status: 403 })); fireEvent.press(screen.getByText('Обновить звонок')); await screen.findByText('Нет доступа или функция недоступна на текущем тарифе.'); expect(screen.queryByLabelText('Комментарий')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение звонка')); await screen.findByLabelText('Комментарий')
})
it('Y: initial loading, wrong call ID/success:false, invalid route не вызывает прямой API', async () => {
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); const screen = render(draw())
  expect(screen.getByText('Загружаем звонок…')).toBeTruthy(); expect(screen.queryByLabelText('Комментарий')).toBeNull()
  await act(async () => finish({ success: true, data: { ...mockCall, _id: otherId } })); await screen.findByText('Не удалось загрузить звонок. Повторите чтение.')
  mockParams = { id: 'local-call' }; const count = mockGet.mock.calls.length; screen.rerender(draw()); await screen.findByText('Некорректный ID звонка.'); expect(mockGet).toHaveBeenCalledTimes(count)
})
it.each(['403', 'success:false', 'network'])('Y: result %s сохраняет заметку и соседние поля', async (failure) => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Новая заметка')
  mockPost.mockImplementationOnce(async () => { if (failure === 'success:false') return { success: false, data: mockCall }; throw Object.assign(new Error('secret-url'), failure === '403' ? { status: 403 } : {}) })
  fireEvent.press(screen.getByText('Ответил')); await screen.findByText(failure === '403' ? 'Нет доступа или функция недоступна на текущем тарифе.' : 'Результат не подтверждён. Обновите звонок или повторите проверку; не повторяйте действие без проверки.')
  expect(screen.getByLabelText('Комментарий').props.value).toBe('Новая заметка'); expect(mockPost.mock.calls[0][1]).toEqual({ result: 'answered', note: 'Новая заметка', nextContactAt: null }); expect(mockCall.transcript).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByText('Повторить чтение звонка'))); await waitFor(() => expect(screen.queryByText('Проверяем звонок…')).toBeNull()); expect(screen.getByLabelText('Комментарий').props.value).toBe('Новая заметка')
})
it('Y: result double guard, success exact GET; новый note не стирается поздним ответом', async () => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Отправляемая заметка')
  let finish!: (value: any) => void; mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); fireEvent.press(screen.getByText('Ответил')); fireEvent.press(screen.getByText('Ответил')); await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
  fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Новый note'); mockCall = { ...mockCall, callResult: 'answered', callResultNote: 'Отправляемая заметка' }
  await act(async () => finish({ success: true, data: mockCall })); await screen.findByText('Действие подтверждено сервером.'); expect(screen.getByLabelText('Комментарий').props.value).toBe('Новый note'); expect(mockPrevented).toBe(true)
})
it('Y: нет optimistic link; wrong read-back retry не повторяет POST', async () => {
  const screen = render(draw()); await screen.findByText('Привязать найденного клиента'); mockPost.mockResolvedValueOnce({ success: true, data: { ...mockCall, status: 'linked', linkedClientId: clientId } })
  fireEvent.press(screen.getByText('Привязать найденного клиента')); await confirm(); await screen.findByText('Проверить результат и синхронизацию'); expect(screen.queryByText('Действие подтверждено сервером.')).toBeNull()
  mockCall = { ...mockCall, status: 'linked', linkedClientId: clientId }; fireEvent.press(screen.getByText('Проверить результат и синхронизацию')); await screen.findByText('Действие подтверждено сервером.'); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('Y: link client/event rechecks current tenant cache; local refs excluded', async () => {
  mockEntities.events.push({ _id: 'local-event', clientId: 'local-client', eventType: 'Локальная работа' })
  const screen = render(draw()); await screen.findByText('Привязать найденного клиента'); expect(screen.queryByText('Локальная работа · Дата не указана')).toBeNull()
  fireEvent.press(screen.getByText('Привязать найденного клиента')); mockEntities.clients = []; await confirm(); await screen.findByText('Данные звонка или связи изменились. Обновите звонок и проверьте выбор.'); expect(mockPost).not.toHaveBeenCalled()
})
it('Y: link event подтверждён сервером, payload содержит реальные связи', async () => {
  const screen = render(draw()); await screen.findByText('Фотосъёмка · Дата не указана'); fireEvent.press(screen.getByText('Фотосъёмка · Дата не указана')); await confirm(); await screen.findByText('Действие подтверждено сервером.')
  expect(mockPost).toHaveBeenCalledWith(`/mobile/v1/calls/${id}/link`, { eventId, clientId }, { skipRefresh: true }); expect(screen.getByText('Заказ')).toBeTruthy()
})
it('Y: строгая дата/связанная сохранённая работа для callback', async () => {
  mockCall.linkedEventId = eventId; const screen = render(draw()); await screen.findByLabelText('Следующий контакт'); fireEvent.changeText(screen.getByLabelText('Следующий контакт'), '2026-02-31 10:00'); fireEvent.press(screen.getByText('Перезвонить')); await screen.findByText('Введите существующую дату и время: ГГГГ-ММ-ДД ЧЧ:ММ'); expect(mockPost).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Следующий контакт'), '2026-10-04 10:00'); fireEvent.press(screen.getByText('Перезвонить')); mockEntities.events = []; await confirm(); await screen.findByText('Данные звонка или связи изменились. Обновите звонок и проверьте выбор.'); expect(mockPost).not.toHaveBeenCalled()
})
it('Y: decision create_event sync failure; retry sync+GET/cache, без повторного POST', async () => {
  const screen = render(draw()); await screen.findByText('Создать заявку из звонка'); mockSync.mockRejectedValueOnce(new Error('sync secret')); fireEvent.press(screen.getByText('Создать заявку из звонка')); await confirm(); await screen.findByText('Проверить результат и синхронизацию')
  expect(mockSync).toHaveBeenCalledTimes(1); expect(mockPush).not.toHaveBeenCalled(); expect(screen.queryByText('Действие подтверждено сервером.')).toBeNull()
  fireEvent.press(screen.getByText('Проверить результат и синхронизацию')); await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/events/${eventId}`)); expect(mockPost).toHaveBeenCalledTimes(1); expect(mockSync).toHaveBeenCalledTimes(2)
})
it('Y: decision не навигирует в отсутствующую карточку после sync', async () => {
  mockEntities.events = []; const screen = render(draw()); await screen.findByText('Создать заявку из звонка'); fireEvent.press(screen.getByText('Создать заявку из звонка')); await confirm(); await screen.findByText('Результат не подтверждён. Обновите звонок или повторите проверку; не повторяйте действие без проверки.'); expect(mockSync).toHaveBeenCalledTimes(1); expect(mockPush).not.toHaveBeenCalled()
})
it('Y: task result sync failure сохраняет note, check не повторяет task POST', async () => {
  mockCall.linkedEventId = eventId; const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Контакт'); mockSync.mockRejectedValueOnce(new Error('failed')); fireEvent.press(screen.getByText('Создать задачу')); await confirm(); await screen.findByText('Проверить результат и синхронизацию'); expect(screen.getByLabelText('Комментарий').props.value).toBe('Контакт')
  fireEvent.press(screen.getByText('Проверить результат и синхронизацию')); await screen.findByText('Действие подтверждено сервером.'); expect(mockPost).toHaveBeenCalledTimes(1); expect(mockSync).toHaveBeenCalledTimes(2)
})
it('Y: process/analyze double guard и no automatic retry', async () => {
  mockCall.transcript = ''; mockCall.recordingUrl = 'https://example.invalid/audio'; const screen = render(draw()); await screen.findByText('Распознать запись'); mockPost.mockRejectedValueOnce(new Error('network')); fireEvent.press(screen.getByText('Распознать запись')); fireEvent.press(screen.getByText('Распознать запись')); expect(Alert.alert).toHaveBeenCalledTimes(1); await confirm()
  await screen.findByText('Результат не подтверждён. Обновите звонок или повторите проверку; не повторяйте действие без проверки.'); fireEvent.press(screen.getByText('Распознать запись')); expect(mockPost).toHaveBeenCalledTimes(1)
  await act(async () => fireEvent.press(screen.getByText('Повторить чтение звонка'))); await waitFor(() => expect(screen.queryByText('Проверяем звонок…')).toBeNull()); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('Y: unsafe recording/phone и raw processingError не открываются/не показываются', async () => {
  mockCall.phone = 'javascript:79991112233'; mockCall.recordingUrl = 'file:///private'; mockCall.processingError = 'secret-signed-url'; const screen = render(draw()); await screen.findByText(mockCall.transcript)
  fireEvent.press(screen.getByText('Позвонить')); fireEvent.press(screen.getByText('Открыть запись')); expect(Linking.openURL).not.toHaveBeenCalled(); expect(screen.queryByText('secret-signed-url')).toBeNull()
})
it('Y: route change отменяет старый confirm/draft; late post не sync/GET/navigation', async () => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Draft'); fireEvent.press(screen.getByText('Создать заявку из звонка')); const oldConfirm = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress
  mockParams = { id: otherId }; mockCall = { ...mockCall, _id: otherId, callResultNote: 'Другая заметка', transcript: 'Другой звонок' }; screen.rerender(draw()); expect(screen.queryByText('Draft')).toBeNull(); await screen.findByLabelText('Комментарий'); expect(screen.getByLabelText('Комментарий').props.value).toBe('Другая заметка'); await act(async () => oldConfirm()); expect(mockPost).not.toHaveBeenCalled()
  let finish!: (value: any) => void; mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); fireEvent.press(screen.getByText('Создать заявку из звонка')); await confirm(); await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1)); screen.unmount(); const count = mockGet.mock.calls.length
  await act(async () => finish({ success: true, data: { call: mockCall, event: { _id: eventId } } })); expect(mockGet).toHaveBeenCalledTimes(count); expect(mockSync).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
})
it('Y: dirty/back и focus reload не затирают note', async () => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Draft'); expect(mockPrevented).toBe(true)
  act(() => mockBack({ data: { action: { type: 'GO_BACK' } } })); expect(Alert.alert).toHaveBeenCalledWith('Есть несохранённые изменения', expect.any(String), expect.any(Array))
  mockFocus += 1; await act(async () => screen.rerender(draw())); await waitFor(() => expect(screen.queryByText('Проверяем звонок…')).toBeNull()); expect(screen.getByLabelText('Комментарий').props.value).toBe('Draft')
})
it('Y: analyze и ignore подтверждаются точным GET, ignore требует confirm', async () => {
  const screen = render(draw()); await screen.findByText('Сделать AI-разбор'); fireEvent.press(screen.getByText('Сделать AI-разбор')); await confirm(); await screen.findByText('Итог'); expect(mockPost).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByText('Игнорировать звонок')); expect(mockPost).toHaveBeenCalledTimes(1); await confirm(); await screen.findByText('Не клиент'); expect(mockPost).toHaveBeenCalledTimes(2)
})
it('Y: decision no_event не запускает создание/sync, unsafe/wrong action ID отклоняется', async () => {
  const screen = render(draw()); await screen.findByText('Без заявки'); fireEvent.press(screen.getByText('Без заявки')); await confirm(); await screen.findByText('Действие подтверждено сервером.'); expect(mockSync).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
  mockPost.mockResolvedValueOnce({ success: true, data: { ...mockCall, _id: otherId, status: 'ignored' } }); fireEvent.press(screen.getByText('Игнорировать звонок')); await confirm(); await screen.findByText('Результат не подтверждён. Обновите звонок или повторите проверку; не повторяйте действие без проверки.'); expect(screen.queryByText('Не клиент')).toBeNull()
})
it('Y: task read-back требует exact task ID из синхронизированной работы', async () => {
  mockCall.linkedEventId = eventId; const screen = render(draw()); await screen.findByLabelText('Комментарий')
  mockPost.mockImplementationOnce(async (_path: string, body: any) => { mockCall = { ...mockCall, callResult: body.result, callResultNote: body.note }; return { success: true, data: { call: mockCall, event: { _id: eventId }, task: { _id: otherId, date: body.nextContactAt } } } })
  fireEvent.press(screen.getByText('Создать задачу')); await confirm(); await screen.findByText('Проверить результат и синхронизацию'); expect(screen.queryByText('Действие подтверждено сервером.')).toBeNull(); expect(mockSync).toHaveBeenCalledTimes(1)
  const body = mockPost.mock.calls[0][1]; mockEntities.events[0].additionalEvents.push({ _id: otherId, date: body.nextContactAt }); fireEvent.press(screen.getByText('Проверить результат и синхронизацию')); await screen.findByText('Действие подтверждено сервером.'); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('Y: старое подтверждение после refresh не срабатывает и late read route не оставляет чужую историю', async () => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.press(screen.getByText('Игнорировать звонок')); const oldConfirm = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress
  await act(async () => fireEvent.press(screen.getByText('Обновить звонок'))); await act(async () => oldConfirm()); expect(mockPost).not.toHaveBeenCalled()
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); fireEvent.press(screen.getByText('Обновить звонок'))
  mockParams = { id: otherId }; mockCall = { ...mockCall, _id: otherId, transcript: 'Текущая история' }; screen.rerender(draw()); await screen.findByText('Текущая история')
  await act(async () => finish({ success: true, data: { ...mockCall, _id: id, transcript: 'Устаревшая история' } })); expect(screen.queryByText('Устаревшая история')).toBeNull()
})
it('Y: запись/телефон открывают только проверенные значения, client cache recheck prevents чужой переход', async () => {
  mockCall.recordingUrl = 'https://example.invalid/audio'; const screen = render(draw()); await screen.findByText('Открыть запись'); fireEvent.press(screen.getByText('Открыть запись')); fireEvent.press(screen.getByText('Позвонить')); await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2))
  expect(Linking.openURL).toHaveBeenCalledWith('tel:+79991112233'); expect(Linking.openURL).toHaveBeenCalledWith('https://example.invalid/audio')
  mockEntities.clients = []; fireEvent.press(screen.getByRole('button', { name: client.firstName })); await screen.findByText('Связанная запись недоступна. Обновите данные.'); expect(mockPush).not.toHaveBeenCalled()
})
it('Y: ответил не объявляет несохранённую дату сохранённой, старый Back не теряет новый note', async () => {
  const screen = render(draw()); await screen.findByLabelText('Комментарий'); fireEvent.changeText(screen.getByLabelText('Следующий контакт'), '2026-10-04 11:00'); fireEvent.press(screen.getByText('Ответил')); await screen.findByText('Действие подтверждено сервером.'); expect(mockPrevented).toBe(true); expect(screen.getByLabelText('Следующий контакт').props.value).toBe('2026-10-04 11:00')
  act(() => mockBack({ data: { action: { type: 'GO_BACK' } } })); const oldBack = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress; fireEvent.changeText(screen.getByLabelText('Комментарий'), 'Более новая заметка'); await act(async () => oldBack()); expect(mockDispatch).not.toHaveBeenCalled()
})
