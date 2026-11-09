import React from 'react'
const { installReadiness, measureRender, measureEvents } = require('../../../__tests__/stageN/readiness.cjs')
import { act, fireEvent as nativeFireEvent, render as nativeRender, waitFor, within } from '@testing-library/react-native/pure'
import { Alert, Keyboard } from 'react-native'
import EventEditScreen from '../../../app/events/edit/[id]'
import { resetPendingEventClient, setPendingEventClient } from '../../shared/domain/eventClientHandoff'
import { clearSharedDraft, setSharedDraft } from '../../shared/native/shareDraft'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { createEventDraft } from '../../shared/domain/eventForm'

require('../../../__tests__/stageO/measuredCleanup.cjs').installMeasuredCleanup()
installReadiness('create')
const render = measureRender(nativeRender)
const fireEvent = measureEvents(nativeFireEvent)
require('../../../__tests__/stageN/nativeHosts.cjs').initializeNativeHosts(nativeRender)
let mockParams: Record<string, unknown>
const mockAiRead = jest.fn(), mockAiSave = jest.fn(), mockAiDiscard = jest.fn(), mockAiRefresh = jest.fn()
const mockCreateRead = jest.fn(), mockCreateSave = jest.fn(), mockCreateDiscard = jest.fn()
jest.mock('./aiCreateReview', () => ({ readAiCreateReview: (...args: unknown[]) => mockCreateRead(...args), saveAiCreatedEvent: (...args: unknown[]) => mockCreateSave(...args), discardAiCreateReview: (...args: unknown[]) => mockCreateDiscard(...args) }))
jest.mock('../../shared/storage/localEntityIds', () => ({ resolveLocalEntityId: async (_kind: string, id: string) => id }))
jest.mock('./aiReview', () => ({ ...jest.requireActual('./aiReview'), readAiReview: (...args: unknown[]) => mockAiRead(...args), saveAiReview: (...args: unknown[]) => mockAiSave(...args), discardAiReview: (...args: unknown[]) => mockAiDiscard(...args), refreshAiReview: (...args: unknown[]) => mockAiRefresh(...args) }))
let mockPrevented = false
let mockOnRemove: (event: any) => void
let mockClients: any[] = []
let mockServices: any[] = []
let mockSettings: any[] = []
let mockTransactions: any[] = []
let mockTransactionsFail = false
let mockClientsFail = false
let mockFocusCallbacks: Array<() => unknown> = []
const mockDispatch = jest.fn()
let mockPhotoFields: any = { eventType: 'Фото-заказ', clientId: 'client' }
let mockPhotoApply: (fields: any) => Promise<void>
const mockClientGet = jest.fn()
const mockAddressPost = jest.fn()
const mockUpsert = jest.fn(async (..._args: unknown[]) => undefined)
jest.mock('../../shared/api/client', () => ({ api: {
  get: (...args: unknown[]) => require('../../../__tests__/stageN/readiness.cjs').measureCall(mockClientGet, args, 'client'),
  post: (...args: unknown[]) => mockAddressPost(...args),
} }))
jest.mock('./PhotoDraftSection', () => {
  const { Text } = require('react-native')
  return { PhotoDraftSection: ({ onApply }: { onApply: (fields: any) => Promise<void> }) => { mockPhotoApply = onApply; return <Text>mode:photo</Text> } }
})
let mockSavedEntity: any = null
let mockReadbackFail = false
const mockSave = jest.fn()
const mockDelete = jest.fn(async (_entityType: string, _entityId: string) => undefined)
const mockGetEntity = jest.fn()
const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockInvalidate = jest.fn(async () => undefined)
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon', FontAwesome5: 'Icon' }))
jest.mock('../../shared/native/device', () => ({ deviceSession: () => ({ generation: 'share-test-session' }) }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => unknown) => { mockFocusCallbacks.push(callback) },
  router: { back: jest.fn(), push: (path: unknown) => mockPush(path), replace: (path: unknown) => mockReplace(path) },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: mockDispatch }),
}))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, handler: (event: any) => void) => { mockPrevented = prevent; mockOnRemove = handler } }))
jest.mock('@tanstack/react-query', () => ({ QueryClientContext: jest.requireActual('@tanstack/react-query').QueryClientContext, useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }))
jest.mock('../../shared/storage/cache', () => ({
  upsertEntities: (...args: unknown[]) => mockUpsert(...args),
  listCachedEntities: async (kind: string) => {
    if (kind === 'transactions' && mockTransactionsFail) throw new Error('Чтение транзакций недоступно')
    if (kind === 'clients' && mockClientsFail) throw new Error('Чтение клиентов недоступно')
    return kind === 'clients' ? mockClients : kind === 'transactions' ? mockTransactions : kind === 'siteSettings' ? mockSettings : kind === 'services' ? mockServices : []
  },
  getCachedEntity: (entityType: string, id: string) => mockSavedEntity?._id === id ? mockReadbackFail ? Promise.reject(new Error('Ошибка перечитывания')) : Promise.resolve(mockSavedEntity) : mockGetEntity(entityType, id),
}))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: async (payload: any) => { const result = await mockSave(payload); mockSavedEntity = { ...payload.values, ...result }; return result }, deleteLocalEntity: (entityType: string, entityId: string) => mockDelete(entityType, entityId) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ genitive: 'заказа', accusative: 'заказ', labelCapitalized: 'Заказ' }) }))
jest.mock('./VoiceDraftSection', () => {
  const { Text } = require('react-native')
  return { VoiceDraftSection: ({ initialMode }: { initialMode: string }) => <Text>{`mode:${initialMode}`}</Text> }
})

it.each(['classic', 'compact'])('shared text is visible in the ordinary %s form and survives cache hydration', async variant => {
  mockSettings = [{ custom: { eventFormVariant: variant } }]
  mockParams = { id: 'new', initialStatus: 'draft', shareDraft: 'shared-input' }
  setSharedDraft({ id: 'shared-input', generation: 'share-test-session', text: 'Текст из другой программы', mode: 'manual' })
  const screen = render(<EventEditScreen />)
  const description = await screen.findByLabelText('Описание')
  expect(description.props.value).toBe('Текст из другой программы')
  expect(screen.queryByText('mode:manual')).toBeNull()
  await runFocus(); expect(screen.getByLabelText('Описание').props.value).toBe('Текст из другой программы')
  expect(mockSave).not.toHaveBeenCalled()
})

const runFocus = async () => {
  const callback = mockFocusCallbacks[mockFocusCallbacks.length - 1]
  mockFocusCallbacks = []
  if (callback) await act(async () => { callback() })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  jest.clearAllMocks()
  clearSharedDraft()
  mockSavedEntity = null
  mockReadbackFail = false
  mockFocusCallbacks = []
  mockClients = [{ _id: 'client', firstName: 'Анна' }]
  mockTransactions = []
  mockServices = []
  mockSettings = [{ custom: { eventFormVariant: 'classic' } }]
  mockTransactionsFail = false
  mockClientsFail = false
  mockParams = { id: 'new', clientId: 'client' }
  mockSave.mockResolvedValue({ _id: 'local-event' })
  mockGetEntity.mockResolvedValue({ _id: 'existing', status: 'closed', clientId: 'client', eventDate: '2026-10-15', description: 'Существующая работа' })
  resetPendingEventClient()
  mockAiRead.mockReset(); mockAiSave.mockReset(); mockAiDiscard.mockReset(); mockAiRefresh.mockReset()
  mockCreateRead.mockReset(); mockCreateSave.mockReset(); mockCreateDiscard.mockReset()
})

const reviewFixture = () => ({ _id: 'ai-plan', preview: { _id: 'existing', clientId: 'client', status: 'draft' as const, eventType: 'Предложение', description: '<p>Сохранить HTML</p>', syncVersion: 2 },
  plan: { planId: 'ai-plan', eventId: 'existing', eventTitle: 'Предложение', completed: [], expiresAt: '2030-01-01', eventPatch: { eventType: 'Предложение' }, clientPatch: null,
    steps: [{ entity: 'event' as const, operation: 'update' as const, description: '', changes: [{ field: 'eventType', label: 'Название', before: 'Было', after: 'Предложение' }] }] } })
const creationFixture = () => ({ _id: 'ai-create', fields: { status: 'draft', eventType: 'Новая работа', description: 'Из запроса', clientId: 'client' }, sourceText: 'Создай новую работу', aiFilledFields: ['eventType', 'description'], aiWarnings: [], clientDraft: { firstName: 'Анна', phone: 79992222222 } })
it.each(['light', 'dark'] as const)('AI creation populates an editable ordinary form; new client requires a separate review: %s', async mode => {
  mockParams = { id: 'new', aiDraft: 'ai-create' }; mockCreateRead.mockResolvedValue(creationFixture())
  mockCreateSave.mockResolvedValue({ _id: 'created' })
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><EventEditScreen /></ThemeProvider>)
  expect((await screen.findByLabelText('Описание')).props.value).toBe('Из запроса')
  fireEvent.press(screen.getByText('Проверить нового клиента'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/clients/edit/[id]', params: { id: 'new', returnTo: 'event', aiDraft: 'ai-create' } })
  expect(mockSave).not.toHaveBeenCalled(); expect(mockCreateSave).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByTestId('event-type'), 'Исправлено до сохранения')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/created'))
  expect(mockCreateSave.mock.calls[0][1]).toMatchObject({ eventType: 'Исправлено до сохранения', clientId: 'client', description: 'Из запроса' })
  expect(mockSave).not.toHaveBeenCalled()
})
it('frozen creation can resume after a client ID remap without revalidating stale form IDs', async () => {
  const form = createEventDraft(); form.values.clientId = 'local-old-client'; form.values.eventType = 'Подтверждено'
  const payload = { clientId: 'local-old-client', eventType: 'Подтверждено', status: 'draft' }
  mockParams = { id: 'new', aiDraft: 'ai-create' }
  mockCreateRead.mockResolvedValue({ ...creationFixture(), eventAttempt: { operationId: 'same-operation', values: payload, form } })
  mockCreateSave.mockResolvedValue({ _id: 'created' })
  const screen = render(<EventEditScreen />)
  await screen.findByText('Тип работы: Подтверждено')
  expect(mockCreateSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/created'))
  expect(mockCreateSave.mock.calls[0][1]).toEqual(payload)
})
it('cancelling AI creation discards only the local review', async () => {
  mockParams = { id: 'new', aiDraft: 'ai-create' }; mockCreateRead.mockResolvedValue(creationFixture())
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-type')
  fireEvent.press(screen.getByTestId('cancel-event'))
  await waitFor(() => expect(mockCreateDiscard).toHaveBeenCalledWith('ai-create', expect.any(Function)))
  expect(mockCreateSave).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
})
it.each(['light', 'dark'] as const)('AI review opens the ordinary form and sends only manual corrections: %s', async mode => {
  mockParams = { id: 'existing', aiPlan: 'ai-plan' }; mockAiRead.mockResolvedValue(reviewFixture())
  mockAiSave.mockResolvedValue({ _id: 'existing' })
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><EventEditScreen /></ThemeProvider>)
  const input = await screen.findByTestId('event-type')
  expect(input.props.value).toBe('Предложение')
  expect(screen.getByTestId('ai-plan-summary')).toBeTruthy()
  expect(screen.queryByText('mode:manual')).toBeNull()
  expect(mockAiSave).not.toHaveBeenCalled()
  fireEvent.changeText(input, 'Исправлено вручную')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockAiSave).toHaveBeenCalledTimes(1))
  expect(mockAiSave.mock.calls[0][2]).toEqual({ eventType: 'Исправлено вручную' })
  expect(mockSave).not.toHaveBeenCalled()
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/existing'))
})
it('recovery restores the confirmed form and does not apply until an explicit save', async () => {
  const review = reviewFixture(), draft = createEventDraft(review.preview)
  draft.values.eventType = 'Подтверждённая правка'
  mockParams = { id: 'existing', aiPlan: 'ai-plan' }
  mockAiRead.mockResolvedValue({ ...review, attempt: { operationId: 'stable', manualChanges: { eventType: 'Подтверждённая правка' }, draft } })
  const screen = render(<EventEditScreen />)
  await screen.findByText('Продолжить сохранение')
  expect(screen.getByTestId('event-type', { includeHiddenElements: true }).props.value).toBe('Подтверждённая правка')
  expect(screen.getByText('Тип работы: Подтверждённая правка')).toBeTruthy()
  expect(mockAiSave).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
  expect(screen.getByText('Вернуться позже')).toBeTruthy()
})
it('cancelling unconfirmed AI suggestions never calls ordinary save', async () => {
  mockParams = { id: 'existing', aiPlan: 'ai-plan' }; mockAiRead.mockResolvedValue(reviewFixture())
  mockAiDiscard.mockResolvedValue(undefined)
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('ai-plan-summary')
  fireEvent.press(screen.getByTestId('cancel-event'))
  await waitFor(() => expect(mockAiDiscard).toHaveBeenCalledWith('ai-plan', expect.any(Function)))
  expect(mockAiSave).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
})

it.each([
  ['active', 'active'], ['draft', 'draft'], ['canceled', 'draft'], ['closed', 'draft'],
  [undefined, 'draft'], [['active'], 'draft'],
])('форма сохраняет начальный status %s как %s через штатную локальную очередь', async (initialStatus, expected) => {
  mockParams = { id: 'new', clientId: 'client', initialStatus }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  fireEvent.changeText(screen.getByTestId('event-type'), 'Тестовая работа')
  if (expected === 'active') fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityType: 'events', values: { status: expected, eventType: 'Тестовая работа' } })
  expect(mockSave.mock.calls[0][0].entityId).toBeUndefined()
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/local-event'))
})

it('смена URL не перезаписывает статус и введённые поля в уже открытой форме', async () => {
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'manual' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(screen.getByText('Помощник ИИ')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-type'), 'Введённая работа')
  fireEvent.press(screen.getByText('Заявка'))
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'voice' }
  screen.rerender(<EventEditScreen />)
  expect(screen.getByText('Помощник ИИ')).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values).toMatchObject({ status: 'draft', eventType: 'Введённая работа' })
})

it.each([['existing', undefined, 'closed'], ['new', 'existing', 'draft']])('URL не меняет статус редактируемой/клонируемой работы %s', async (id, cloneId, status) => {
  mockParams = { id, cloneId, initialStatus: 'active', mode: 'voice' }
  const screen = render(<EventEditScreen />)
  await screen.findByDisplayValue('Существующая работа')
  if (cloneId) expect(screen.getByText('Помощник ИИ')).toBeTruthy()
  else { expect(screen.queryByText('mode:manual')).toBeNull(); expect(screen.getByText('Изменить с ИИ')).toBeTruthy() }
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  if (mockParams.id === 'new') expect(mockSave.mock.calls[0][0].values.status).toBe(status)
  else expect(mockSave.mock.calls[0][0].values).not.toHaveProperty('status')
})

it('legacy voice entry redirects to the unified assistant without saving', async () => {
  mockParams = { id: 'new', clientId: 'client', initialStatus: 'active', mode: 'voice' }
  const screen = render(<EventEditScreen />)
  await act(async () => undefined)
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/events/assistant', params: { mode: 'voice' } })
  screen.unmount()
  expect(mockSave).not.toHaveBeenCalled()
})

it('общий draft переживает смену вкладок, клавиатуру, Back и ошибку сохранения', async () => {
  mockSave.mockRejectedValueOnce(new Error('Очередь временно недоступна'))
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-type')
  fireEvent.changeText(screen.getByTestId('event-type'), 'Новый заказ')
  fireEvent.changeText(screen.getByLabelText('Описание'), 'Сохранить текст')
  fireEvent.press(screen.getByTestId('event-section-finance'))
  fireEvent.changeText(screen.getByLabelText('Договорная сумма'), '17000')
  fireEvent.press(screen.getByTestId('event-section-contacts'))
  fireEvent.press(screen.getByText('Добавить задачу/событие'))
  fireEvent.changeText(screen.getByLabelText('Что сделать'), 'Перезвонить')
  fireEvent.press(screen.getByTestId('event-section-general'))
  act(() => Keyboard.dismiss())
  expect(screen.getByDisplayValue('Новый заказ')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'GO_BACK' } } }))
  expect(alert).toHaveBeenCalled()
  expect(mockDispatch).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('Сохранить текст')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await screen.findByText('Очередь временно недоступна')
  expect(screen.getByDisplayValue('Новый заказ')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-section-finance'))
  expect(screen.getByDisplayValue('17000')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-section-contacts'))
  expect(screen.getByDisplayValue('Перезвонить')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(mockSave).toHaveBeenCalledTimes(2)
  expect(mockSave.mock.calls[1][0].values).toMatchObject({ eventType: 'Новый заказ', contractSum: 17000,
    additionalEvents: [expect.objectContaining({ title: 'Перезвонить' })] })
  alert.mockRestore()
}, 10000)

it('прямой переход в секцию и local ID сохраняют редактирование через outbox', async () => {
  mockParams = { id: 'local-event', section: 'finance' }
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Договорная сумма')
  fireEvent.changeText(screen.getByLabelText('Договорная сумма'), '200')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalled())
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityId: 'local-event', values: { contractSum: 200 } })
})

it('ошибка загрузки существующей работы не разрешает перезаписать её пустым draft', async () => {
  mockParams = { id: 'missing' }
  mockGetEntity.mockResolvedValue(null)
  const screen = render(<EventEditScreen />)
  await screen.findByText('Запись не найдена в локальных данных')
  expect(screen.queryByTestId('save-event')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
})

it('ALIGN: отмена прошедшей заявки требует причину и явное сохранение', async () => {
  mockParams = { id: 'past-draft', decision: 'canceled' }
  mockGetEntity.mockResolvedValue({ _id: 'past-draft', status: 'draft', clientId: 'client', eventDate: '2026-09-01' })
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Причина отмены')
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Причина отмены'), 'Клиент отменил')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entityId: 'past-draft', values: { status: 'canceled', cancelReason: 'Клиент отменил' } })
})

it('ALIGN: Дата пока неизвестна очищает обе даты только у заявки', async () => {
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Начало')
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  fireEvent.changeText(screen.getByLabelText('Окончание'), '2026-10-15 14:00')
  fireEvent.press(screen.getByText('Дата пока неизвестна'))
  expect(screen.getByLabelText('Начало').props.value).toBe('')
  expect(screen.getByLabelText('Окончание').props.value).toBe('')
  fireEvent.press(screen.getByText('Подтверждено'))
  expect(screen.queryByText('Дата пока неизвестна')).toBeNull()
})

it('применяет длительность организации и сохраняет интервал при уточнении времени начала', async () => {
  mockSettings = [{ custom: { eventFormVariant: 'classic', defaultEventDurationMinutes: 90 } }]
  const screen = render(<EventEditScreen />)
  await screen.findByLabelText('Начало')
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15')
  expect(screen.getByLabelText('Окончание').props.value).toBe('2026-10-15 01:30')
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 1')
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  expect(screen.getByLabelText('Окончание').props.value).toBe('2026-10-15 13:30')
})

it('позднее уточнение адреса не отменяет ручную правку улицы', async () => {
  mockSettings = [{ custom: { eventFormVariant: 'classic' } }]
  const address = { town: 'Город', street: 'Ленина', house: '1', latitude: '', longitude: '' }
  let finishRefinement!: (response: unknown) => void
  mockAddressPost.mockImplementation((_path, input) => input.mode === 'select'
    ? new Promise(resolve => { finishRefinement = resolve })
    : Promise.resolve({ success: true, data: { suggestions: [{ label: 'Город, Ленина, 1', address }] } }))
  const screen = render(<EventEditScreen />)
  fireEvent.changeText(await screen.findByLabelText('Поиск адреса'), 'Ленина')
  fireEvent.press(await screen.findByText('Город, Ленина, 1'))
  expect(screen.getByLabelText('Улица').props.value).toBe('Ленина')
  fireEvent.changeText(screen.getByLabelText('Улица'), 'Мира')
  await act(async () => finishRefinement({ success: true, data: { selected: { address: { ...address, latitude: '55', longitude: '37' } } } }))
  expect(screen.getByLabelText('Улица').props.value).toBe('Мира')
})

it('H: ошибка транзакций не блокирует форму и выбор созданного клиента при возврате', async () => {
  mockParams = { id: 'new', section: 'contacts' }
  mockTransactionsFail = true
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-main-client-search')
  mockClients.push({ _id: 'local-created', firstName: 'Новый клиент' })
  setPendingEventClient('local-created')
  await runFocus()
  expect(screen.getByTestId('event-main-client-value').props.children).toBe('Новый клиент')
  fireEvent.press(screen.getByTestId('event-section-finance'))
  expect(screen.getByText('Не удалось прочитать транзакции. Факт и обязательства недоступны.')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values.clientId).toBe('local-created')
})

it('H: ошибка обновления клиентов не выдаётся за ошибку финансов и не теряет передачу клиента', async () => {
  mockParams = { id: 'new', section: 'contacts' }
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-main-client-search')
  mockClientsFail = true
  setPendingEventClient('local-created')
  await runFocus()
  expect(screen.getByText('Не удалось обновить клиентов. Вернитесь к вкладке, чтобы повторить загрузку.')).toBeTruthy()
  mockClientsFail = false
  mockClients.push({ _id: 'local-created', firstName: 'Созданный клиент' })
  await runFocus()
  expect(screen.getByTestId('event-main-client-value').props.children).toBe('Созданный клиент')
  fireEvent.press(screen.getByTestId('event-section-finance'))
  expect(screen.queryByText('Не удалось прочитать транзакции. Факт и обязательства недоступны.')).toBeNull()
})

it('P: клиент выбирается поиском, а создание открывает клиентский редактор с возвратом', async () => {
  mockParams = { id: 'new', section: 'contacts' }
  mockClients = [
    { _id: 'client', firstName: 'Анна', phone: '79990000000' },
    { _id: 'boris', firstName: 'Борис', phone: '79995550000' },
  ]
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-main-client-search')
  fireEvent.press(screen.getByText('Новый клиент'))
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/clients/edit/[id]', params: expect.objectContaining({ id: 'new', returnTo: 'event' }),
  }))
  fireEvent.changeText(screen.getByTestId('event-main-client-search'), 'борис')
  fireEvent.press(screen.getByTestId('event-main-client-option-boris'))
  expect(screen.getByText('Борис')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values.clientId).toBe('boris')
})

it('P: созданный в клиентском редакторе клиент выбирается при возврате', async () => {
  mockParams = { id: 'new', section: 'contacts' }
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-main-client-search')
  setPendingEventClient('new-client')
  mockClients = [{ _id: 'client', firstName: 'Анна' }, { _id: 'new-client', firstName: 'Галина' }]
  await runFocus()
  await waitFor(() => expect(screen.getByText('Галина')).toBeTruthy())
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values.clientId).toBe('new-client')
})

it('P: задача сохраняется в общем draft вместе с выполнением', async () => {
  mockParams = { id: 'new', clientId: 'client', section: 'contacts' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('Добавить задачу/событие')
  fireEvent.press(screen.getByText('Добавить задачу/событие'))
  fireEvent.changeText(screen.getByLabelText('Что сделать'), 'Финализировать смету')
  fireEvent.press(screen.getByTestId('event-task-0-done'))
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values.additionalEvents).toEqual([
    expect.objectContaining({ title: 'Финализировать смету', done: true, doneAt: expect.any(String) }),
  ])
})

it('Q: финансы и факт задатка сериализуются без нулевой подмены и служебных полей', async () => {
  mockParams = { id: 'local-event', section: 'finance' }
  mockGetEntity.mockResolvedValue({ _id: 'local-event', status: 'active', clientId: 'client', eventDate: '2026-10-15T12:00:00.000Z', contractSum: 1000 })
  mockTransactions = [
    { _id: 't-deposit', eventId: 'local-event', amount: 5000, type: 'income', category: 'deposit', date: '2026-10-01' },
    { _id: 't-other', eventId: 'other-event', amount: 1, type: 'income', category: 'tips', date: '2026-10-01' },
  ]
  const screen = render(<EventEditScreen />)
  await screen.findByText('Документов: 0')
  expect(screen.queryByText('Ждем задаток')).toBeNull()
  expect(screen.getByText('Задаток отмечен фактической транзакцией. Ожидание задатка скрыто.')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Комментарий по финансам'), 'Оплачен задаток')
  fireEvent.press(screen.getByText('По договору'))
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  const values = mockSave.mock.calls[0][0].values
  expect(values).toMatchObject({
    financeComment: 'Оплачен задаток', isByContract: true,
  })
  for (const key of ['documents', 'documentFiles', 'tenantId', '_id', 'syncVersion']) expect(values).not.toHaveProperty(key)
})

it('Q: связанная транзакция открывается и удаляется только через существующую очередь', async () => {
  mockParams = { id: 'local-event', section: 'finance' }
  mockGetEntity.mockResolvedValue({ _id: 'local-event', status: 'active', clientId: 'client' })
  mockTransactions = [{ _id: 't-income', eventId: 'local-event', amount: 5000, type: 'income', category: 'deposit', date: '2026-10-01' }]
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  const screen = render(<EventEditScreen />)
  await screen.findByText('Добавить транзакцию')
  fireEvent.press(screen.getByText('Добавить транзакцию'))
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/finance/edit/new', params: expect.objectContaining({ eventId: 'local-event', returnTo: 'event' }),
  }))
  fireEvent.press(screen.getByLabelText('Редактировать транзакцию'))
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/finance/edit/[id]', params: expect.objectContaining({ id: 't-income', eventId: 'local-event', returnTo: 'event' }),
  }))
  fireEvent.press(screen.getByLabelText('Удалить транзакцию'))
  const buttons = alert.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>
  await act(async () => {
    const confirm = buttons.find((button) => button.style === 'destructive')?.onPress
    confirm?.()
    confirm?.()
  })
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('transactions', 't-income'))
  expect(mockDelete).toHaveBeenCalledTimes(1)
  alert.mockRestore()
})

it('Q: переход к документам и возврат сохраняют draft и не восстанавливают удалённое вложение', async () => {
  const sourceEvent = {
    _id: 'local-event', status: 'active', clientId: 'client', eventDate: '2026-10-15T12:00:00.000Z', contractSum: 100,
    documents: [{ id: 'doc-1', type: 'contract' }],
  }
  mockParams = { id: 'local-event', section: 'finance' }
  mockGetEntity.mockResolvedValue(sourceEvent)
  const screen = render(<EventEditScreen />)
  await screen.findByText('Документов: 1')
  fireEvent.changeText(screen.getByLabelText('Договорная сумма'), '900')
  fireEvent.press(screen.getByText('Файлы и документы'))
  expect(mockPush).toHaveBeenCalledWith('/events/local-event/documents')
  mockGetEntity.mockResolvedValue({ ...sourceEvent, documents: [], documentFiles: [] })
  await runFocus()
  await waitFor(() => expect(screen.getByText('Документов: 0')).toBeTruthy())
  expect(screen.getByDisplayValue('900')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  const values = mockSave.mock.calls[0][0].values
  expect(values).toMatchObject({ contractSum: 900 })
  expect(values).not.toHaveProperty('documents')
  expect(values).not.toHaveProperty('documentFiles')
})

it('Q: новая работа требует явного сохранения до документов и транзакций', async () => {
  mockParams = { id: 'new', clientId: 'client', section: 'finance' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('Сначала сохраните заявку — после этого появятся связанные транзакции.')
  expect(screen.getByText('Файлы и документы доступны после сохранения заявки.')).toBeTruthy()
  fireEvent.press(screen.getByText('Файлы и документы'))
  expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Добавить транзакцию'))
  expect(mockPush).not.toHaveBeenCalled()
})

it('Q: повторное сохранение блокируется, пока первое не завершено', async () => {
  let resolveSave: (value: unknown) => void = () => undefined
  mockSave.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-section-finance')
  fireEvent.press(screen.getByTestId('save-event'))
  fireEvent.press(screen.getByTestId('save-event'))
  expect(mockSave).toHaveBeenCalledTimes(1)
  await act(async () => { resolveSave({ _id: 'local-event' }) })
})

it('photo applies fields into actual editor without automatic save', async () => {
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  await act(async () => { await mockPhotoApply(mockPhotoFields) })
  expect(screen.getByDisplayValue('Фото-заказ')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0].values).toMatchObject({ eventType: 'Фото-заказ', clientId: 'client' })
})
it('photo cannot import a foreign client into editor/cache', async () => {
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  mockClientGet.mockRejectedValueOnce(new Error('Клиент не найден'))
  await act(async () => { await expect(mockPhotoApply({ clientId: 'foreign-b', eventType: 'Чужая работа' })).rejects.toThrow('Клиент не найден') })
  expect(screen.queryByDisplayValue('Чужая работа')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
})

it('photo rechecks and caches a newly recognized client before applying', async () => {
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  const client = { _id: 'new-client', firstName: 'Борис', tenantId: 'tenant-a' }
  mockClientGet.mockResolvedValueOnce({ data: client })
  await act(async () => { await mockPhotoApply({ eventType: 'Фото нового клиента', clientId: 'new-client' }) })
  expect(mockClientGet).toHaveBeenCalledWith('/mobile/v1/clients/new-client')
  expect(mockUpsert).toHaveBeenCalledWith('clients', [client])
  expect(screen.getByDisplayValue('Фото нового клиента')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
})


it('A: компактная форма по умолчанию — независимое раскрытие, помощь и отмена выбора услуг', async () => {
  mockSettings = []
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-compact-client')
  expect(screen.queryByTestId('event-section-general')).toBeNull()
  expect(screen.queryByLabelText('Начало')).toBeNull()
  fireEvent.press(screen.getByTestId('event-compact-dates-toggle'))
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  fireEvent.press(screen.getByTestId('event-compact-location-toggle'))
  expect(screen.getByLabelText('Начало')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-compact-dates-toggle'))
  fireEvent.press(screen.getByLabelText('Подсказка: Дата и время'), { stopPropagation: jest.fn() })
  expect(screen.getByTestId('field-help-panel')).toBeTruthy()
  expect(screen.queryByLabelText('Начало')).toBeNull()
  fireEvent.press(screen.getByLabelText('Закрыть подсказку'))
  fireEvent.press(screen.getByTestId('event-compact-services-toggle'))
  fireEvent.press(screen.getByText('Выбрать услуги'))
  fireEvent.changeText(within(screen.getByTestId('event-service-picker')).getByTestId('event-type'), 'Не применять')
  fireEvent.press(screen.getByText('Отмена выбора услуг'))
  expect(screen.queryByDisplayValue('Не применять')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('event-compact-dates-toggle'))
  expect(screen.getByDisplayValue('2026-10-15 12:00')).toBeTruthy()
  fireEvent.press(screen.getByTestId('cancel-event'))
  expect(require('expo-router').router.back).toHaveBeenCalledTimes(1)
  expect(mockPrevented).toBe(true)
  expect(mockSave).not.toHaveBeenCalled()
})

it('A: валидация раскрывает нужный раздел; ошибка очереди сохраняет ввод', async () => {
  mockSettings = []
  mockParams = { id: 'new' }
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-compact-client')
  fireEvent.press(screen.getByTestId('save-event'))
  expect(screen.getByTestId('event-main-client-search')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-main-client-search'), 'Анна')
  fireEvent.press(screen.getByTestId('event-main-client-option-client'))
  fireEvent.press(screen.getByTestId('event-compact-status-toggle'))
  fireEvent.press(screen.getByText('Подтверждено'))
  fireEvent.press(screen.getByTestId('save-event'))
  expect(screen.getByLabelText('Начало')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Начало'), '2026-10-15 12:00')
  mockSave.mockRejectedValueOnce(new Error('Очередь недоступна'))
  fireEvent.press(screen.getByTestId('save-event'))
  await screen.findByText('Очередь недоступна')
  expect(screen.getByDisplayValue('2026-10-15 12:00')).toBeTruthy()
})

it('A: передача видна в сводке и несвязанная правка сохраняет исходные persisted-поля', async () => {
  mockSettings = []
  mockParams = { id: 'existing' }
  const source = { _id: 'existing', status: 'draft', clientId: 'client', isTransferred: true, colleagueId: 'colleague',
    eventType: 'Исходный', description: '<p>Запрос</p>', servicesIds: ['old-service'],
    eventDate: '2026-10-15T12:00:12.123Z', dateEnd: '2026-10-15T14:00:12.123Z',
    address: { town: 'Город', street: 'Улица', house: '1', entrance: '2', floor: '3', flat: '4', comment: 'Вход', latitude: '55', longitude: '37', link2Gis: 'https://2gis.ru', linkYandexNavigator: 'https://yandex.ru' },
    requestCreatedAt: '2026-10-01T12:12:12.123Z', calendarImportChecked: true, importedFromFile: true, fileImportChecked: true,
    contractSum: 120.25, waitDeposit: true, depositExpectedAmount: 20.25, depositDueAt: '2026-10-13T12:00:12.123Z',
    financeComment: 'Счёт', isByContract: true, otherContacts: [{ clientId: 'other', comment: 'Бухгалтер' }],
    additionalEvents: [{ _id: 'task', title: 'Позвонить', description: '<p>О цене</p>', date: '2026-10-12T12:00:12.123Z', done: true, doneAt: '2026-10-10T12:00:00Z' }],
  }
  mockClients.push({ _id: 'colleague', firstName: 'Борис', secondName: 'Петров' })
  mockGetEntity.mockResolvedValue(source)
  const screen = render(<EventEditScreen />)
  await screen.findByText('Передано: Борис Петров')
  fireEvent.press(screen.getByTestId('event-compact-finance-toggle'))
  fireEvent.changeText(screen.getByLabelText('Комментарий по финансам'), 'Новая заметка')
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  const payload = mockSave.mock.calls[0][0].values
  for (const key of ['isTransferred', 'colleagueId', 'eventType', 'description', 'servicesIds', 'eventDate', 'dateEnd', 'address', 'requestCreatedAt', 'calendarImportChecked', 'fileImportChecked', 'contractSum', 'waitDeposit', 'depositExpectedAmount', 'depositDueAt', 'isByContract', 'otherContacts', 'additionalEvents']) {
    expect(payload).not.toHaveProperty(key)
  }
  expect(payload.financeComment).toBe('Новая заметка')
})

it('A: фото сохраняет источник, предупреждения, подсветку поля и свёрнутого раздела', async () => {
  mockSettings = []
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  await act(async () => { await (mockPhotoApply as any)({ eventType: 'Фото-заказ', clientId: 'client', contractSum: 123.45 },
    { sourceText: 'Оригинальная заметка', aiWarnings: ['Проверьте сумму'], aiFilledFields: ['eventType', 'contractSum', 'clientId'] }) })
  expect(screen.getByText('Оригинальная заметка')).toBeTruthy()
  expect(screen.getByText('Проверьте сумму')).toBeTruthy()
  expect(screen.getByTestId('event-compact-services-ai')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-compact-services-toggle'))
  expect(screen.getByTestId('ai-field-eventType')).toBeTruthy()
  fireEvent.changeText(screen.getByTestId('event-type'), 'Ручная правка')
  expect(screen.queryByTestId('event-compact-services-ai')).toBeNull()
  expect(screen.getByTestId('event-compact-finance-ai')).toBeTruthy()
  fireEvent.press(screen.getByTestId('event-compact-finance-toggle'))
  expect(screen.getByTestId('ai-field-contractSum')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('Договорная сумма'), '123.45')
  expect(screen.queryByTestId('event-compact-finance-ai')).toBeNull()
  expect(screen.getByText('Проверьте сумму')).toBeTruthy()
  expect(mockSave).not.toHaveBeenCalled()
})

it('A: ошибка перечитывания точного объекта сохраняет ввод и повтор использует тот же local ID', async () => {
  mockSettings = []
  mockReadbackFail = true
  const screen = render(<EventEditScreen />)
  await screen.findByTestId('event-compact-services-toggle')
  fireEvent.press(screen.getByTestId('event-compact-services-toggle'))
  fireEvent.changeText(screen.getByTestId('event-type'), 'Не терять')
  fireEvent.press(screen.getByTestId('save-event'))
  await screen.findByText('Ошибка перечитывания')
  expect(screen.getByDisplayValue('Не терять')).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
  mockReadbackFail = false
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/local-event'))
  expect(mockSave.mock.calls[1][0].entityId).toBe('local-event')
})

it('A: медленный защищённый GET при фото не стирает несвязанную ручную правку', async () => {
  mockParams = { id: 'new', mode: 'photo' }
  let resolveClient: (result: any) => void = () => undefined
  mockClientGet.mockImplementationOnce(() => new Promise(resolve => { resolveClient = resolve }))
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  let pending: Promise<void> = Promise.resolve()
  await act(async () => { pending = mockPhotoApply({ eventType: 'Фото', clientId: 'new-client' }) })
  fireEvent.changeText(screen.getByLabelText('Описание'), 'Введено во время GET')
  await act(async () => { resolveClient({ data: { _id: 'new-client', firstName: 'Борис' } }); await pending })
  expect(screen.getByDisplayValue('Введено во время GET')).toBeTruthy()
  expect(screen.getByDisplayValue('Фото')).toBeTruthy()
})

it('A: применение выбора услуг меняет draft, отмена сохраняет выбор и подсветку', async () => {
  mockSettings = []
  mockServices = [{ _id: 'service-a', title: 'Услуга А' }, { _id: 'service-b', title: 'Услуга Б' }]
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  await act(async () => { await (mockPhotoApply as any)({ eventType: 'С фото', clientId: 'client', servicesIds: ['service-a'] },
    { sourceText: 'Источник', aiWarnings: [], aiFilledFields: ['eventType', 'servicesIds'] }) })
  fireEvent.press(screen.getByTestId('event-compact-services-toggle'))
  fireEvent.press(screen.getByText('Выбрать услуги'))
  fireEvent.changeText(within(screen.getByTestId('event-service-picker')).getByTestId('event-type'), 'Отмена')
  fireEvent.press(within(screen.getByTestId('event-service-picker')).getByText('Услуга Б'))
  fireEvent.press(screen.getByText('Отмена выбора услуг'))
  expect(screen.getByTestId('event-type').props.value).toBe('С фото')
  expect(screen.getByTestId('ai-field-eventType')).toBeTruthy()
  fireEvent.press(screen.getByText('Выбрать услуги'))
  fireEvent.changeText(within(screen.getByTestId('event-service-picker')).getByTestId('event-type'), 'Применено')
  fireEvent.press(within(screen.getByTestId('event-service-picker')).getByText('Услуга Б'))
  fireEvent.press(screen.getByText('Применить услуги'))
  expect(screen.getByTestId('event-type').props.value).toBe('Применено')
  expect(screen.queryByTestId('ai-field-eventType')).toBeNull()
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  expect(mockSave.mock.calls[0][0].values.servicesIds).toEqual(['service-a', 'service-b'])
})
it('A: ошибка сохранения оставляет AI-маркеры; успешное перечитывание снимает их', async () => {
  mockSettings = []
  mockParams = { id: 'new', mode: 'photo' }
  const screen = render(<EventEditScreen />)
  await screen.findByText('mode:photo')
  await act(async () => { await (mockPhotoApply as any)({ eventType: 'С фото', clientId: 'client' },
    { sourceText: 'Источник', aiWarnings: ['Проверить'], aiFilledFields: ['eventType', 'clientId'] }) })
  mockSave.mockRejectedValueOnce(new Error('Ошибка записи'))
  fireEvent.press(screen.getByTestId('save-event'))
  await screen.findByText('Ошибка записи')
  expect(screen.getByTestId('event-compact-services-ai')).toBeTruthy()
  expect(screen.getByText('Источник')).toBeTruthy()
  fireEvent.press(screen.getByTestId('save-event'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/local-event'))
  expect(screen.queryByTestId('event-compact-services-ai')).toBeNull()
  expect(screen.queryByTestId('event-compact-client-ai')).toBeNull()
  expect(screen.queryByText('Источник')).toBeNull()
})
