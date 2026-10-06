import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as WebBrowser from 'expo-web-browser'
import { IntegrationsSection } from './IntegrationsSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { unconfirmed } from './integrationContract'
const mockGet = jest.fn(); const mockPost = jest.fn(); const mockPatch = jest.fn(); const mockDelete = jest.fn(); const mockPush = jest.fn()
let mockFocus = true
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('../../shared/config/env', () => ({ env: { appScheme: 'vedelo' } }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), post: (...args: any[]) => mockPost(...args), patch: (...args: any[]) => mockPatch(...args), delete: (...args: any[]) => mockDelete(...args) } }))
const ok = (data: any) => ({ success: true, data })
const key1 = { id: 'first-key', name: 'Первый сайт', enabled: true, lastFour: '1111' }
const key2 = { id: 'second-key', name: 'Второй сайт', enabled: true, lastFour: '2222' }
const secret = `lead_${'a'.repeat(48)}`
const novofonSecret = `novofon_${'b'.repeat(48)}`
let states: Record<string, any>; let mockOverview: any; let mockCalendars: any[]
let overviewError: any; let dedicatedAiError: any
const state = (provider: string, patch = {}) => ({ provider, available: true, enabled: true, configured: true, status: 'connected', ...patch })
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}><IntegrationsSection /></ThemeProvider>
function deferred() { let resolve!: (value: any) => void; let reject!: (reason: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no }); return { resolve, reject, promise } }
beforeEach(() => {
  jest.resetAllMocks(); mockFocus = true; overviewError = null; dedicatedAiError = null
  states = {
    'google-calendar': { available: true, connected: true, enabled: true, calendarId: 'primary', calendarName: 'Длинный рабочий календарь '.repeat(30), reminders: { useDefault: true, overrides: [] }, deleteCanceledFromCalendar: false, skipTransferredFromCalendar: false },
    avito: state('avito', { clientId: 'client-original', accountId: '00123' }),
    vk: state('vk', { accountId: '00456' }),
    telephony: state('telephony', { hasApiKey: true }),
    ai: state('ai', { analysisProvider: 'artistcrm', transcriptionProvider: 'artistcrm', hasTranscriptionKey: false, platformConfigured: true, transcriptionModel: 'whisper-1', analysisModel: 'gpt-4o-mini', canUseDeepseek: true }),
    'public-leads': state('public-leads', { endpoint: 'https://vedelo.example/api/public/lead', keys: [key1, key2] }),
    telegram: state('telegram', { status: 'bot_ready', botUsername: 'test_bot' }),
  }
  mockOverview = () => ({ googleCalendar: states['google-calendar'], avito: states.avito, vk: states.vk, telephony: states.telephony, ai: { ...states.ai, enabled: false, configured: false }, publicLeadApi: states['public-leads'], telegram: states.telegram })
  mockCalendars = [{ id: 'primary', summary: 'Основной', primary: true }, { id: 'second', summary: 'Название '.repeat(80), primary: false }]
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/mobile/v1/integrations/status') { if (overviewError) throw overviewError; return ok(mockOverview()) }
    if (path === '/mobile/v1/integrations/google-calendar/calendars') return ok({ calendars: mockCalendars, selectedId: states['google-calendar'].calendarId })
    if (path.includes('/auth-url?')) return ok({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed-state' })
    if (path === '/ai/usage') return ok({ balance: 10, requiredBalance: 1, available: true, platformConfigured: true, summary: { operations: 0, charged: 0 }, quotes: [], recent: [] })
    const provider = path.split('/').pop()!
    if (provider === 'ai' && dedicatedAiError) throw dedicatedAiError
    if (!states[provider]) throw new Error('unexpected request')
    return ok({ ...states[provider] })
  })
  mockPost.mockImplementation(async (path: string, body: any) => {
    if (path.endsWith('/select')) { states['google-calendar'] = { ...states['google-calendar'], calendarId: body.calendarId, calendarName: mockCalendars.find((item) => item.id === body.calendarId)?.summary, enabled: true }; return ok({ calendarId: body.calendarId, calendarName: states['google-calendar'].calendarName }) }
    const provider = path.split('/').pop()!
    if (provider === 'public-leads') { states[provider] = { ...states[provider], enabled: true, keys: [...states[provider].keys, { id: 'issued-exact-key', name: body.name, enabled: true, lastFour: secret.slice(-4) }] }; return ok({ ...states[provider], issuedKey: secret }) }
    if (provider === 'telephony') { states[provider] = { ...states[provider], enabled: true, configured: true }; return ok({ ...states[provider], setup: { webhookSecret: novofonSecret, webhookUrl: `https://vedelo.example/api/telephony/novofon/webhook?tenantId=own-tenant&secret=${novofonSecret}` } }) }
    if (provider === 'ai') states[provider] = { ...states[provider], analysisProvider: body.provider, configured: true, enabled: true, transcriptionModel: body.transcriptionModel, analysisModel: body.analysisModel }
    else states[provider] = { ...states[provider], enabled: true, configured: true, accountId: body.groupId || body.userId, ...(body.clientId ? { clientId: body.clientId } : {}) }
    return ok(states[provider])
  })
  mockPatch.mockImplementation(async (path: string, body: any) => {
    const provider = path.split('/').pop()!
    if (provider === 'avito' || provider === 'vk') return ok(states[provider])
    if (provider === 'public-leads' && body.keyId) states[provider] = { ...states[provider], keys: states[provider].keys.map((key: any) => key.id === body.keyId ? { ...key, enabled: body.enabled } : key) }
    else states[provider] = { ...states[provider], ...body, ...(provider === 'ai' ? { provider: 'ai' } : {}) }
    return ok(states[provider])
  })
  mockDelete.mockImplementation(async (path: string, body: any) => {
    const provider = path.split('/').pop()!
    if (provider === 'public-leads' && body?.keyId) states[provider] = { ...states[provider], keys: states[provider].keys.filter((key: any) => key.id !== body.keyId) }
    else states[provider] = { ...states[provider], configured: false, connected: false, enabled: false, accountId: '', clientId: '', calendarId: '', hasApiKey: false, hasTranscriptionKey: false, analysisProvider: 'artistcrm', keys: [] }
    return ok(states[provider])
  })
  ;(Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true)
  ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'vedelo://more/integrations?gc_connected=1' })
})
const open = async (screen: ReturnType<typeof render>, name: string) => { const row = await screen.findByLabelText(`Настроить ${name}`); await act(async () => { fireEvent.press(row) }); await waitFor(() => expect(screen.queryByLabelText('Загрузка состояния интеграции')).toBeNull()) }
const noPrivileged = () => {
  for (const mock of [mockGet, mockPost, mockPatch, mockDelete]) for (const [path] of mock.mock.calls) expect(path).not.toMatch(/adminUsage|\/ai\/settings|coefficient|operator|telegram\/(connect|disconnect)|integrations\/telegram/)
}
it.each(['light', 'dark'] as const)('единый компактный список %s, длинные данные и только пользовательские запросы', async (mode) => {
  const screen = render(draw(mode)); await screen.findByLabelText('Настроить ИИ-провайдер')
  const palette = mode === 'dark' ? darkPalette : lightPalette
  expect(StyleSheet.flatten(screen.getByText('Google Calendar').props.style).color).toBe(palette.text)
  expect(screen.getAllByLabelText(/Настроить /)).toHaveLength(7)
  expect(screen.queryByText('Приостановлено')).toBeNull() // AI overview lies, dedicated GET wins.
  await open(screen, 'Google Calendar'); await screen.findByText(mockCalendars[1].summary)
  expect(StyleSheet.flatten(screen.getByText(states['google-calendar'].calendarName).props.style).color).toBe(palette.text)
  const radio = screen.getByLabelText(`Выбрать календарь ${mockCalendars[1].summary}`)
  expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(40)
  fireEvent.press(screen.getByText('Закрыть без сохранения')); await open(screen, 'Входящие заявки API')
  expect(screen.getByText(key1.name)).toBeTruthy()
  for (const label of ['DeepSeek', 'Администрирование', 'Сохранить коэффициент']) expect(screen.queryByText(label)).toBeNull()
  noPrivileged()
})
it('initial loading не показывает отключённые интеграции и ошибку можно повторить', async () => {
  const request = deferred(); mockGet.mockImplementationOnce(() => request.promise)
  const screen = render(draw()); expect(screen.getByLabelText('Загрузка списка интеграций')).toBeTruthy(); expect(screen.queryByText('Не подключено')).toBeNull(); expect(screen.queryByTestId('integrations-list')).toBeNull()
  await act(async () => request.reject(new Error('provider-secret')))
  await screen.findByText('Не удалось загрузить список интеграций. Повторите чтение.')
  expect(screen.queryByText('provider-secret')).toBeNull(); expect(screen.getAllByText('Статус неизвестен')).toHaveLength(6)
  fireEvent.press(screen.getByText('Повторить загрузку интеграций')); await screen.findByText('Обновить статусы')
  expect(screen.queryByText('Не удалось загрузить список интеграций. Повторите чтение.')).toBeNull()
})
it('partial overview/AI failure не ломает остальных и dedicated GET можно повторить', async () => {
  dedicatedAiError = new Error('secret')
  mockOverview = () => ({ googleCalendar: states['google-calendar'], avito: { enabled: true }, telephony: states.telephony })
  const screen = render(draw()); await screen.findByText('Состояние ИИ не получено. Откройте настройки для повторного чтения.')
  expect(screen.getAllByText('Статус неизвестен')).toHaveLength(5)
  await open(screen, 'ИИ-провайдер'); expect(screen.queryByText('Включить ИИ Ведело')).toBeNull()
  dedicatedAiError = null; await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByText('Включить ИИ Ведело')
  fireEvent.press(screen.getByText('Закрыть без сохранения')); await open(screen, 'Novofon'); await screen.findByText('Выпустить новый webhook')
})
it.each([null, { success: false, data: {} }, { success: true, data: { avito: { available: true } } }])('некорректный overview %p показывает unknown', async (response) => {
  mockGet.mockImplementationOnce(async () => response)
  const screen = render(draw()); await screen.findByLabelText('Настроить Avito'); expect(screen.queryByText('Не подключено')).toBeNull(); expect(screen.getAllByText('Статус неизвестен')).toHaveLength(6)
})
it('ошибка календарей локальна, retry только GET, Google pause и оба event flags подтверждаются', async () => {
  const base = mockGet.getMockImplementation()!; let failure = true
  mockGet.mockImplementation(async (path: string) => path.endsWith('/calendars') && failure ? Promise.reject(new Error('token=raw')) : base(path))
  const screen = render(draw()); await open(screen, 'Google Calendar'); await screen.findByText('Не удалось загрузить календари Google. Остальные интеграции доступны.')
  expect(screen.getByLabelText('Настроить Avito')).toBeTruthy(); failure = false
  fireEvent.press(screen.getByText('Повторить загрузку календарей')); await screen.findByText('Основной')
  fireEvent.press(screen.getByText('Приостановить синхронизацию')); await screen.findByText('Синхронизация приостановлена')
  expect(mockPatch).toHaveBeenLastCalledWith('/mobile/v1/integrations/google-calendar', { enabled: false }, { skipRefresh: true })
  fireEvent.press(screen.getByLabelText('Удалять отменённые события из календаря')); await screen.findByText('Настройка отменённых событий сохранена')
  fireEvent.press(screen.getByLabelText('Не переносить переданные события')); await screen.findByText('Настройка переданных событий сохранена')
  expect(states['google-calendar'].deleteCanceledFromCalendar).toBe(true); expect(states['google-calendar'].skipTransferredFromCalendar).toBe(true)
})
it('выбор конкретного календаря, email/popup reminders и disconnect без ложной паузы у соседей', async () => {
  const screen = render(draw()); await open(screen, 'Google Calendar'); await screen.findByText('Основной')
  fireEvent.press(screen.getByLabelText(`Выбрать календарь ${mockCalendars[1].summary}`)); await screen.findByText(`Выбран календарь «${mockCalendars[1].summary}»`)
  expect(mockPost).toHaveBeenLastCalledWith('/mobile/v1/integrations/google-calendar/select', { calendarId: 'second' }, { skipRefresh: true })
  fireEvent.press(screen.getByLabelText('Использовать стандартные уведомления Google')); fireEvent.press(screen.getByText('Сохранить напоминания'))
  await screen.findByText('Укажите хотя бы одно напоминание и положительное число минут.')
  fireEvent.press(screen.getByText('Добавить напоминание')); fireEvent.press(screen.getByLabelText('Напоминание 1: Уведомление'))
  fireEvent.changeText(screen.getByLabelText('Минут до события — напоминание 1'), '90'); fireEvent.press(screen.getByText('Сохранить напоминания')); await screen.findByText('Напоминания Google Calendar сохранены')
  expect(mockPatch).toHaveBeenLastCalledWith('/mobile/v1/integrations/google-calendar', { reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 90 }] } }, { skipRefresh: true })
  fireEvent.press(screen.getByText('Отключить Google Calendar')); expect(mockDelete).not.toHaveBeenCalled(); fireEvent.press(screen.getByText('Подтвердить отключение Google Calendar')); await screen.findByText('Google Calendar отключён, OAuth-токены удалены')
})
it.each(['network', 'mismatch', 'success:false'])('Google pause %s -> read-back warning, GET-only retry', async (failure) => {
  const screen = render(draw()); await open(screen, 'Google Calendar'); await screen.findByText('Основной')
  const base = mockGet.getMockImplementation()!; let fail = true
  mockGet.mockImplementation(async (path: string) => path.endsWith('/google-calendar') && fail ? failure === 'network' ? Promise.reject(new Error('raw-secret')) : failure === 'success:false' ? { success: false, data: states['google-calendar'] } : ok({ ...states['google-calendar'], enabled: true }) : base(path))
  fireEvent.press(screen.getByText('Приостановить синхронизацию')); await screen.findByText(unconfirmed); expect(screen.queryByText('Синхронизация приостановлена')).toBeNull()
  fail = false; await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByText('Синхронизация приостановлена'); expect(mockPatch).toHaveBeenCalledTimes(1)
})
it.each([{ type: 'cancel' }, { type: 'dismiss' }, { type: 'success', url: 'https://evil.example/?gc_connected=1' }, { type: 'success', url: 'vedelo://more/integrations?gc_error=state' }, { type: 'success', url: 'vedelo://more/integrations?gc_connected=1&gc_error=exchange' }])('OAuth %p без ложного success', async (result) => {
  states['google-calendar'].connected = false; states['google-calendar'].enabled = false
  ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce(result)
  const screen = render(draw()); await open(screen, 'Google Calendar'); fireEvent.press(screen.getByText('Подключить Google Calendar'))
  await screen.findByText(result.type === 'cancel' || result.type === 'dismiss' ? 'Подключение отменено. Настройки не подтверждены.' : unconfirmed)
  expect(screen.queryByText('Google Calendar подключён')).toBeNull(); expect(mockPost).not.toHaveBeenCalled()
})
it.each([true, false])('OAuth callback требует серверный connected=%s', async (connected) => {
  states['google-calendar'].connected = false; states['google-calendar'].enabled = false
  ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockImplementationOnce(async () => { states['google-calendar'].connected = connected; states['google-calendar'].enabled = connected; return { type: 'success', url: 'vedelo://more/integrations?gc_connected=1' } })
  const screen = render(draw()); await open(screen, 'Google Calendar'); fireEvent.press(screen.getByText('Подключить Google Calendar'))
  await screen.findByText(connected ? 'Google Calendar подключён' : unconfirmed)
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=signed-state', 'vedelo://more/integrations')
  expect(mockGet.mock.calls.some(([url]) => /Bearer|access_token/.test(url))).toBe(false)
})
it.each(['avito', 'vk'])('%s исходные credentials, проверка PATCH без enabled и конкретное отключение', async (provider) => {
  const screen = render(draw()); await open(screen, provider === 'avito' ? 'Avito' : 'VK')
  if (provider === 'avito') fireEvent.changeText(screen.getByLabelText('Client Secret'), 'original-token')
  else { fireEvent.changeText(screen.getByLabelText('Токен сообщества'), 'original-token'); fireEvent.changeText(screen.getByLabelText('Строка подтверждения Callback API'), 'confirmation') }
  fireEvent.press(screen.getByText('Проверить и подключить')); await screen.findByText(`${provider === 'avito' ? 'Avito' : 'VK'} подключён`)
  expect(mockPost).toHaveBeenLastCalledWith(`/mobile/v1/integrations/${provider}`, provider === 'avito' ? { clientId: 'client-original', clientSecret: 'original-token', userId: '00123' } : { groupId: '00456', accessToken: 'original-token', confirmationCode: 'confirmation' }, { skipRefresh: true })
  expect(screen.getByLabelText(provider === 'avito' ? 'Client Secret' : 'Токен сообщества').props.value).toBe('')
  fireEvent.press(screen.getByText('Проверить текущее подключение')); await screen.findByText(`${provider === 'avito' ? 'Avito' : 'VK'}: подключение работает`)
  expect(mockPatch).toHaveBeenLastCalledWith(`/mobile/v1/integrations/${provider}`, undefined, { skipRefresh: true })
  fireEvent.press(screen.getByText('Отключить интеграцию')); fireEvent.press(screen.getByText(`Подтвердить отключение ${provider === 'avito' ? 'Avito' : 'VK'}`)); await screen.findByText(`${provider === 'avito' ? 'Avito' : 'VK'} отключён, реквизиты удалены`)
})
it.each(['403', 'network', 'success:false', 'invalid'])('credentials POST %s очищает секрет, не повторяется и не показывает raw error', async (failure) => {
  mockPost.mockImplementationOnce(async () => { if (failure === '403') throw Object.assign(new Error('credential=secret'), { status: 403 }); if (failure === 'network') throw new Error('credential=secret'); return failure === 'invalid' ? ok({ enabled: true }) : { success: false, data: states.avito } })
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.changeText(screen.getByLabelText('Client Secret'), 'original-secret')
  fireEvent.press(screen.getByText('Проверить и подключить')); await screen.findByText(failure === '403' ? 'Нет доступа или интеграция недоступна на текущем тарифе.' : unconfirmed)
  expect(screen.getByLabelText('Client Secret').props.value).toBe(''); expect(screen.queryByText('credential=secret')).toBeNull(); expect(screen.queryByText('Avito подключён')).toBeNull()
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await waitFor(() => expect(screen.queryByLabelText('Загрузка состояния интеграции')).toBeNull()); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('credential валидация отвергает исходные пробелы без POST/нормализации', async () => {
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.changeText(screen.getByLabelText('Client Secret'), ' token '); fireEvent.press(screen.getByText('Проверить и подключить'))
  await screen.findByText('Заполните реквизиты без пробелов по краям и недопустимых символов.'); expect(mockPost).not.toHaveBeenCalled(); expect(screen.getByLabelText('Client Secret').props.value).toBe(' token ')
})
it('double tap + смена формы во время POST: общий guard до ответа, late результат не меняет VK', async () => {
  const request = deferred(); mockPost.mockImplementationOnce(() => request.promise)
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.changeText(screen.getByLabelText('Client Secret'), 'token')
  const button = screen.getByText('Проверить и подключить'); act(() => { fireEvent.press(button); fireEvent.press(button) }); expect(mockPost).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByText('Закрыть без сохранения')); await open(screen, 'VK'); expect(screen.queryByLabelText('Токен сообщества')).toBeNull()
  await act(async () => request.resolve(ok(states.avito))); expect(screen.queryByText('Avito подключён')).toBeNull(); expect(screen.queryByLabelText('Client Secret')).toBeNull()
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByLabelText('Токен сообщества'); expect(screen.getByLabelText('Токен сообщества').props.value).toBe('')
})
it('late initial GET после смены провайдера не открывает предыдущую форму', async () => {
  const request = deferred(); const base = mockGet.getMockImplementation()!; let first = true
  mockGet.mockImplementation(async (path: string) => path.endsWith('/avito') && first ? (first = false, request.promise) : base(path))
  const screen = render(draw()); fireEvent.press(await screen.findByLabelText('Настроить Avito')); fireEvent.press(screen.getByLabelText('Настроить VK'))
  await act(async () => request.resolve(ok(states.avito))); expect(screen.queryByLabelText('Client Secret')).toBeNull(); expect(screen.queryByText('Подключение Avito')).toBeNull()
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByLabelText('Токен сообщества')
})
it('Novofon ротация с подтверждением, один POST; секрет живёт при read-back отказе и Clipboard rejection', async () => {
  const screen = render(draw()); await open(screen, 'Novofon'); fireEvent.changeText(screen.getByLabelText('Ключ Novofon (необязательно)'), 'new-key')
  fireEvent.press(screen.getByText('Выпустить новый webhook')); expect(mockPost).not.toHaveBeenCalled()
  const base = mockGet.getMockImplementation()!; let failure = true
  mockGet.mockImplementation(async (path: string) => path.endsWith('/telephony') && failure ? Promise.reject(new Error('secret')) : base(path))
  act(() => { const button = screen.getByText('Подтвердить выпуск нового webhook'); fireEvent.press(button); fireEvent.press(button) })
  await screen.findByText(unconfirmed); expect(screen.getByText(novofonSecret)).toBeTruthy(); expect(screen.getByLabelText('Ключ Novofon (необязательно)').props.value).toBe('')
  ;(Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('secret'))
  fireEvent.press(screen.getByText('Скопировать секрет')); await screen.findByText('Не удалось скопировать. Значение остаётся в открытой форме.'); expect(screen.queryByText('Секрет скопирован')).toBeNull()
  failure = false; await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByText('Novofon включён. Новый webhook выдан; скопируйте его сейчас.')
  expect(mockPost).toHaveBeenCalledTimes(1); expect(mockPatch.mock.calls.some(([path]) => path.endsWith('/telephony'))).toBe(false)
  fireEvent.press(screen.getByText('Скопировать webhook URL')); await screen.findByText('Webhook URL скопирован'); fireEvent.press(screen.getByText('Закрыть без сохранения')); expect(screen.queryByText(novofonSecret)).toBeNull()
})
it('создание API key идентифицирует именно issued ID; read-back GET-only retry сохраняет одноразовый секрет', async () => {
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.changeText(screen.getByLabelText('Название нового источника'), 'Новый сайт')
  const base = mockGet.getMockImplementation()!; let wrong = true
  mockGet.mockImplementation(async (path: string) => path.endsWith('/public-leads') && wrong ? ok({ ...states['public-leads'], keys: [...states['public-leads'].keys.filter((key: any) => key.id !== 'issued-exact-key'), { id: 'other-created-key', name: 'Новый сайт', enabled: true, lastFour: secret.slice(-4) }] }) : base(path))
  fireEvent.press(screen.getByText('Создать новый API key')); await screen.findByText(unconfirmed); expect(screen.queryByText('API key создан. Скопируйте его сейчас.')).toBeNull(); expect(screen.getByText(secret)).toBeTruthy()
  wrong = false; await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByText('API key создан. Скопируйте его сейчас.'); expect(mockPost).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByText('Закрыть секрет')); expect(screen.queryByText(secret)).toBeNull()
})
it('нет issued key ID в POST -> произвольный новый GET не подтверждает выпуск, секрет остаётся', async () => {
  mockPost.mockResolvedValueOnce(ok({ ...states['public-leads'], issuedKey: secret }))
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.changeText(screen.getByLabelText('Название нового источника'), 'Другой')
  fireEvent.press(screen.getByText('Создать новый API key')); await screen.findByText(unconfirmed)
  states['public-leads'].keys.push({ id: 'arbitrary', name: 'Другой', enabled: true, lastFour: secret.slice(-4) })
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await waitFor(() => expect(screen.queryByLabelText('Загрузка состояния интеграции')).toBeNull())
  expect(screen.getByText(secret)).toBeTruthy(); expect(screen.queryByText('API key создан. Скопируйте его сейчас.')).toBeNull(); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('ключи: пауза/включение, конкретное подтверждение удаления и другой ID не удаляется', async () => {
  const screen = render(draw()); await open(screen, 'Входящие заявки API')
  fireEvent.press(screen.getByLabelText('Отключить ключ Первый сайт')); await screen.findByText('Настройки ключа сохранены')
  fireEvent.press(screen.getByLabelText('Включить ключ Первый сайт')); await screen.findByText('Настройки ключа сохранены')
  fireEvent.press(screen.getByText('Приостановить приём заявок')); await screen.findByText('Приём заявок приостановлен')
  fireEvent.press(screen.getByLabelText('Удалить ключ Первый сайт')); expect(mockDelete).not.toHaveBeenCalled()
  fireEvent.press(screen.getByLabelText('Удалить ключ Второй сайт')); expect(mockDelete).not.toHaveBeenCalled()
  expect(screen.queryByText('Подтвердить удаление «Первый сайт»')).toBeNull(); fireEvent.press(screen.getByLabelText('Удалить ключ Второй сайт'))
  await screen.findByText('Ключ «Второй сайт» удалён'); expect(mockDelete).toHaveBeenLastCalledWith('/mobile/v1/integrations/public-leads', { keyId: 'second-key' }, { skipRefresh: true })
  expect(screen.getByText('Первый сайт')).toBeTruthy(); expect(screen.queryByText('Второй сайт')).toBeNull()
})
it('конкретное удаление read-back mismatch не считается успехом', async () => {
  mockDelete.mockResolvedValueOnce(ok(states['public-leads']))
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.press(screen.getByLabelText('Удалить ключ Первый сайт')); fireEvent.press(screen.getByLabelText('Удалить ключ Первый сайт'))
  await screen.findByText(unconfirmed); expect(screen.queryByText('Ключ «Первый сайт» удалён')).toBeNull(); expect(screen.getByText('Первый сайт')).toBeTruthy()
})
it.each(['blur', 'close', 'unmount'])('секрет и поздний POST очищаются при %s', async (method) => {
  const request = deferred(); mockPost.mockImplementationOnce(() => request.promise)
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.changeText(screen.getByLabelText('Название нового источника'), 'Сайт'); fireEvent.press(screen.getByText('Создать новый API key'))
  if (method === 'blur') { mockFocus = false; screen.rerender(draw()) } else if (method === 'close') fireEvent.press(screen.getByText('Закрыть без сохранения')); else screen.unmount()
  await act(async () => request.resolve(ok({ ...states['public-leads'], issuedKey: secret, keys: [...states['public-leads'].keys, { id: 'issued', name: 'Сайт', lastFour: secret.slice(-4), enabled: true }] })))
  if (method !== 'unmount') { expect(screen.queryByText(secret)).toBeNull(); expect(screen.queryByText('API key создан. Скопируйте его сейчас.')).toBeNull() }
})
it('одноразовый секрет, уже показанный пользователю, очищается на blur и не возвращается после focus', async () => {
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.changeText(screen.getByLabelText('Название нового источника'), 'Новый сайт'); fireEvent.press(screen.getByText('Создать новый API key')); await screen.findByText(secret)
  mockFocus = false; screen.rerender(draw()); await waitFor(() => expect(screen.queryByText(secret)).toBeNull()); mockFocus = true; screen.rerender(draw()); await open(screen, 'Входящие заявки API'); expect(screen.queryByText(secret)).toBeNull()
})
it('Telegram read-only: bot_ready/unknown, никаких mutations даже при dev-capability', async () => {
  const screen = render(draw()); await open(screen, 'Telegram Business'); expect(screen.getByText('Бот: @test_bot')).toBeTruthy(); expect(screen.getByText(/В Android доступен только просмотр/)).toBeTruthy()
  expect(screen.queryByText('Подключить Telegram')).toBeNull(); expect(mockPost).not.toHaveBeenCalled(); expect(mockPatch).not.toHaveBeenCalled(); expect(mockDelete).not.toHaveBeenCalled(); noPrivileged()
})
it('Avito webhook_manual отражается как неполная настройка, без заявления о работе webhook', async () => {
  states.avito.status = 'webhook_manual'
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.changeText(screen.getByLabelText('Client Secret'), 'token'); fireEvent.press(screen.getByText('Проверить и подключить'))
  await screen.findByText('Доступ Avito проверен. Webhook нужно настроить вручную в Web/PWA.'); expect(screen.queryByText('Avito подключён')).toBeNull(); expect(screen.getByText('Нужен webhook')).toBeTruthy()
})
it.each(['403', 'success:false', 'invalid'])('initial form %s не рисует доступные управляющие поля', async (failure) => {
  const base = mockGet.getMockImplementation()!
  mockGet.mockImplementation(async (path: string) => path.endsWith('/telephony') ? failure === '403' ? Promise.reject(Object.assign(new Error('secret'), { status: 403 })) : failure === 'success:false' ? { success: false, data: states.telephony } : ok({ ...states.telephony, configured: undefined }) : base(path))
  const screen = render(draw()); await open(screen, 'Novofon'); await screen.findByText(failure === '403' ? 'Нет доступа или интеграция недоступна на текущем тарифе.' : 'Не удалось прочитать состояние интеграции.')
  expect(screen.queryByLabelText('Ключ Novofon (необязательно)')).toBeNull(); expect(mockPost).not.toHaveBeenCalled()
})
it.each(['network', 'success:false'])('Novofon POST %s не получает фиктивный секрет и не повторяется автоматически', async (failure) => {
  mockPost.mockImplementationOnce(async () => { if (failure === 'network') throw new Error('apiKey=secret'); return { success: false, data: { ...states.telephony, setup: { webhookSecret: novofonSecret, webhookUrl: 'https://vedelo.example/webhook' } } } })
  const screen = render(draw()); await open(screen, 'Novofon'); fireEvent.changeText(screen.getByLabelText('Ключ Novofon (необязательно)'), 'new-api-key'); fireEvent.press(screen.getByText('Выпустить новый webhook')); fireEvent.press(screen.getByText('Подтвердить выпуск нового webhook'))
  await screen.findByText(unconfirmed); expect(screen.queryByText(novofonSecret)).toBeNull(); expect(screen.queryByText('apiKey=secret')).toBeNull(); expect(screen.getByLabelText('Ключ Novofon (необязательно)').props.value).toBe('')
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await waitFor(() => expect(screen.queryByLabelText('Загрузка состояния интеграции')).toBeNull()); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('API key double tap блокируется синхронно до React render', async () => {
  const request = deferred(); mockPost.mockImplementationOnce(() => request.promise)
  const screen = render(draw()); await open(screen, 'Входящие заявки API'); fireEvent.changeText(screen.getByLabelText('Название нового источника'), 'Новый сайт')
  act(() => { const button = screen.getByText('Создать новый API key'); fireEvent.press(button); fireEvent.press(button) }); expect(mockPost).toHaveBeenCalledTimes(1)
  await act(async () => request.resolve(ok({ ...states['public-leads'], issuedKey: secret }))); await screen.findByText(secret); expect(screen.getByText(unconfirmed)).toBeTruthy()
})
it('Clipboard false и поздний clipboard result после смены формы не считаются копированием', async () => {
  const screen = render(draw()); await open(screen, 'Входящие заявки API')
  ;(Clipboard.setStringAsync as jest.Mock).mockResolvedValueOnce(false)
  fireEvent.press(screen.getByText('Скопировать endpoint')); await screen.findByText('Не удалось скопировать. Значение остаётся в открытой форме.'); expect(screen.queryByText('Endpoint скопирован')).toBeNull()
  const request = deferred(); (Clipboard.setStringAsync as jest.Mock).mockImplementationOnce(() => request.promise)
  fireEvent.press(screen.getByText('Скопировать endpoint')); fireEvent.press(screen.getByLabelText('Настроить Avito'))
  await act(async () => request.resolve(true)); expect(screen.queryByText('Endpoint скопирован')).toBeNull(); expect(screen.queryByLabelText('Название нового источника')).toBeNull()
  await act(async () => { fireEvent.press(screen.getByText('Повторить чтение состояния')) }); await screen.findByLabelText('Client Secret')
})
it.each(['close', 'blur'])('введённый credentials secret удаляется на %s', async (method) => {
  const screen = render(draw()); await open(screen, 'VK'); fireEvent.changeText(screen.getByLabelText('Токен сообщества'), 'entered-secret'); fireEvent.changeText(screen.getByLabelText('Строка подтверждения Callback API'), 'entered-confirmation')
  if (method === 'blur') { mockFocus = false; screen.rerender(draw()); mockFocus = true; screen.rerender(draw()) } else fireEvent.press(screen.getByText('Закрыть без сохранения'))
  await open(screen, 'VK'); expect(screen.getByLabelText('Токен сообщества').props.value).toBe(''); expect(screen.getByLabelText('Строка подтверждения Callback API').props.value).toBe(''); expect(mockPost).not.toHaveBeenCalled()
})
it('OAuth double tap и закрытие до позднего callback: нет success и второго auth-запроса', async () => {
  states['google-calendar'].connected = false
  const request = deferred(); (WebBrowser.openAuthSessionAsync as jest.Mock).mockImplementationOnce(() => request.promise)
  const screen = render(draw()); await open(screen, 'Google Calendar')
  act(() => { const button = screen.getByText('Подключить Google Calendar'); fireEvent.press(button); fireEvent.press(button) }); await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1))
  fireEvent.press(screen.getByText('Закрыть без сохранения')); await act(async () => request.resolve({ type: 'success', url: 'vedelo://more/integrations?gc_connected=1' }))
  expect(screen.queryByText('Google Calendar подключён')).toBeNull(); expect(mockGet.mock.calls.filter(([path]) => path.includes('/auth-url?'))).toHaveLength(1)
})
it('подтверждение отключения Avito не переносится на VK', async () => {
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.press(screen.getByText('Отключить интеграцию')); await open(screen, 'VK')
  expect(screen.queryByText('Подтвердить отключение Avito')).toBeNull(); fireEvent.press(screen.getByText('Отключить интеграцию')); expect(mockDelete).not.toHaveBeenCalled(); fireEvent.press(screen.getByText('Подтвердить отключение VK'))
  await screen.findByText('VK отключён, реквизиты удалены'); expect(mockDelete).toHaveBeenCalledTimes(1); expect(mockDelete.mock.calls[0][0]).toBe('/mobile/v1/integrations/vk')
})
it('недоступный тариф блокирует connect/check/pause, но конкретный DELETE доступен', async () => {
  states.avito.available = false; states['public-leads'].available = false
  const screen = render(draw()); await open(screen, 'Avito'); fireEvent.press(screen.getByText('Проверить и подключить')); fireEvent.press(screen.getByText('Проверить текущее подключение')); expect(mockPost).not.toHaveBeenCalled(); expect(mockPatch).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Отключить интеграцию')); fireEvent.press(screen.getByText('Подтвердить отключение Avito')); await screen.findByText('Avito отключён, реквизиты удалены')
  await open(screen, 'Входящие заявки API'); fireEvent.press(screen.getByLabelText('Удалить ключ Первый сайт')); fireEvent.press(screen.getByLabelText('Удалить ключ Первый сайт')); await screen.findByText('Ключ «Первый сайт» удалён')
})
it('отсутствующий Telegram summary отображает неизвестное состояние', async () => {
  const base = mockOverview; mockOverview = () => { const data = base(); delete data.telegram; return data }
  const screen = render(draw()); await open(screen, 'Telegram Business'); await screen.findByText('Статус Telegram Business не получен. Обновите список интеграций.'); expect(screen.queryByText('Не подключено')).toBeNull(); noPrivileged()
})
it('Novofon выданный секрет переживает невалидные метаданные POST, но успех не заявляется', async () => {
  mockPost.mockResolvedValueOnce(ok({ available: true, setup: { webhookSecret: novofonSecret, webhookUrl: `https://vedelo.example/api/telephony/novofon/webhook?tenantId=own-tenant&secret=${novofonSecret}` } }))
  const screen = render(draw()); await open(screen, 'Novofon'); fireEvent.press(screen.getByText('Выпустить новый webhook')); fireEvent.press(screen.getByText('Подтвердить выпуск нового webhook'))
  await screen.findByText(unconfirmed); expect(screen.getByText(novofonSecret)).toBeTruthy(); expect(screen.queryByText('Novofon включён. Новый webhook выдан; скопируйте его сейчас.')).toBeNull()
})
it('late overview GET не перезаписывает более свежий targeted read', async () => {
  const screen = render(draw()); await screen.findByLabelText('Настроить ИИ-провайдер')
  const delayed = deferred(); const base = mockGet.getMockImplementation()!
  mockGet.mockImplementation(async (path: string) => path.endsWith('/status') ? delayed.promise : base(path))
  fireEvent.press(screen.getByText('Обновить статусы')); states.ai.enabled = false; await open(screen, 'ИИ-провайдер'); await screen.findByText('Возобновить ИИ')
  await act(async () => delayed.resolve(ok({ ...mockOverview(), ai: { ...states.ai, enabled: true }, avito: { ...states.avito, enabled: false } })))
  expect(screen.getByText('Возобновить ИИ')).toBeTruthy(); expect(screen.getAllByText('Приостановлено')).toHaveLength(1); expect(screen.queryByLabelText('Загрузка списка интеграций')).toBeNull()
})
