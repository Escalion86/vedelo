import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import AiAssistantScreen from './AiAssistantScreen'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { clearSharedDraft, readSharedDraft, setSharedDraft } from '../../shared/native/shareDraft'
const mockPost = jest.fn(), mockPush = jest.fn(), mockOpen = jest.fn(), mockList = jest.fn()
const mockCreateOpen = jest.fn(), mockCreateList = jest.fn()
jest.mock('./aiCreateReview', () => ({ openAiCreateReview: (...args: unknown[]) => mockCreateOpen(...args), listAiCreateReviews: () => mockCreateList() }))
jest.mock('../../shared/native/device', () => ({ deviceSession: () => ({ generation: 'test' }) }))
let mockParams: Record<string, string> = {}, mockEpoch = 1
let mockRequest = 'Перенеси на завтра'
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() }, useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => unknown) => require('react').useEffect(fn, [fn]) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('../../shared/api/client', () => ({ api: { post: (...args: unknown[]) => mockPost(...args) } }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../../shared/storage/localEntityCoordination', () => ({ localDataEpoch: () => mockEpoch }))
jest.mock('./aiReview', () => ({ openAiReview: (...args: unknown[]) => mockOpen(...args), listAiReviews: () => mockList() }))
jest.mock('./VoiceDraftSection', () => ({ VoiceDraftSection: ({ onAnalyzeText, initialText }: { onAnalyzeText: (text: string) => Promise<void>; initialText?: string }) => {
  const { Button } = require('../../shared/ui/components')
  const { Text } = require('react-native')
  return <><Text>{initialText}</Text><Button title="Разобрать тестовый запрос" onPress={() => void onAnalyzeText(initialText || mockRequest)} /></>
} }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
const first = 'a'.repeat(24), second = 'b'.repeat(24)
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; mockEpoch = 1; mockRequest = 'Перенеси на завтра'; mockPost.mockReset(); mockCreateList.mockResolvedValue([]); mockCreateOpen.mockResolvedValue({ _id: 'creation' }); mockList.mockResolvedValue([]); mockOpen.mockResolvedValue({ _id: 'plan', plan: { eventId: second } }) })
afterEach(() => clearSharedDraft())
it('a clipboard phone is attached only to its own request, never to a new unrelated instruction', async () => {
  mockPost.mockResolvedValueOnce({ needsClipboardPhone: true }).mockResolvedValue({ question: 'Уточните дату' })
  const screen = render(<AiAssistantScreen />)
  await act(async () => undefined)
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  fireEvent.changeText(await screen.findByLabelText('Телефон из буфера обмена'), '79992222222')
  fireEvent.press(screen.getByText('Продолжить с этим телефоном'))
  await screen.findByText('Уточните дату')
  expect(mockPost).toHaveBeenLastCalledWith('/mobile/v1/events/ai-assistant', { text: mockRequest, clipboardPhone: '79992222222' })
  mockRequest = 'Создай заявку для другого клиента'
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3))
  expect(mockPost).toHaveBeenLastCalledWith('/mobile/v1/events/ai-assistant', { text: mockRequest })
})
it('shared text waits for explicit analysis, then creates only a local review and opens the ordinary new form', async () => {
  setSharedDraft({ id: 'share', generation: 'test', mode: 'text', text: 'Создай заявку для Анны' })
  mockParams = { shareDraft: 'share', mode: 'text' }
  const result = { fields: { eventType: 'Заявка' }, clientCreated: false, clientDraft: null }
  mockPost.mockResolvedValue(result)
  const screen = render(<AiAssistantScreen />)
  await screen.findByText('Создай заявку для Анны')
  expect(mockPost).not.toHaveBeenCalled(); expect(mockCreateOpen).not.toHaveBeenCalled()
  expect(readSharedDraft('share', 'test')).toBeNull()
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit/[id]', params: { id: 'new', aiDraft: 'creation' } }))
  expect(mockCreateOpen).toHaveBeenCalledWith(result, 'Создай заявку для Анны', expect.any(Function))
  expect(mockOpen).not.toHaveBeenCalled()
})
it('an unfinished creation resumes without repeating paid analysis', async () => {
  mockCreateList.mockResolvedValue([{ _id: 'creation', fields: { eventType: 'Сохранённая заявка' }, eventAttempt: { operationId: 'stable' } }])
  const screen = render(<AiAssistantScreen />)
  fireEvent.press(await screen.findByText('Сохранённая заявка · продолжить сохранение'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit/[id]', params: { id: 'new', aiDraft: 'creation' } })
  expect(mockPost).not.toHaveBeenCalled()
})
it('a unique search match opens its ordinary review directly, without applying anything', async () => {
  mockPost.mockResolvedValueOnce({ candidates: [{ id: second, title: 'Единственная', client: 'Анна' }] }).mockResolvedValueOnce({ planId: 'plan' })
  const screen = render(<AiAssistantScreen />)
  await act(async () => undefined)
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit/[id]', params: { id: second, aiPlan: 'plan' } }))
  expect(mockPost.mock.calls).toEqual([
    ['/mobile/v1/events/ai-assistant', { text: 'Перенеси на завтра' }],
    ['/mobile/v1/events/ai-assistant', { text: 'Перенеси на завтра', eventId: second }],
  ])
})
it.each(['light', 'dark'] as const)('ambiguous matches require choosing a record before preparing its plan: %s', async mode => {
  mockPost.mockResolvedValueOnce({ question: 'Выберите запись', candidates: [{ id: first, title: 'Первая', client: 'Анна' }, { id: second, title: 'Вторая', client: 'Анна' }] })
    .mockResolvedValueOnce({ planId: 'plan' })
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><AiAssistantScreen /></ThemeProvider>)
  await act(async () => undefined)
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  await screen.findByText('Вторая · Анна')
  expect(mockPost).toHaveBeenCalledTimes(1); expect(mockOpen).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Вторая · Анна'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
  expect(mockPost).toHaveBeenLastCalledWith('/mobile/v1/events/ai-assistant', { text: 'Перенеси на завтра', eventId: second })
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/edit/[id]', params: { id: second, aiPlan: 'plan' } })
})
it('recovery opens the stored plan without a paid request; changing session discards late search', async () => {
  mockList.mockResolvedValue([{ _id: 'saved-plan', plan: { eventId: first, eventTitle: 'Незавершённое' }, attempt: { operationId: 'stable' } }])
  let resolve!: (result: unknown) => void
  mockPost.mockReturnValue(new Promise(done => { resolve = done }))
  const screen = render(<AiAssistantScreen />)
  fireEvent.press(await screen.findByText('Незавершённое · продолжить сохранение'))
  expect(mockPost).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Разобрать тестовый запрос'))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
  mockEpoch++
  await act(async () => { resolve({ planId: 'late' }) })
  expect(mockOpen).not.toHaveBeenCalled(); expect(mockPush).toHaveBeenCalledTimes(1)
})
