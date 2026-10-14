import React from 'react'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
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

it('форма ИИ и расходы находятся в выбранной строке, до следующего провайдера',async()=>{
 const screen=render(draw());await screen.findByTestId('integrations-list')
 fireEvent.press(screen.getByLabelText('Настроить ИИ-провайдер')); await screen.findByText('Расходы ИИ Ведело')
 const container=screen.getByTestId('integration-inline-ai')
 expect(within(container).getAllByTestId('integration-form-ai')).toHaveLength(1)
 expect(within(container).getAllByTestId('ai-usage-panel')).toHaveLength(1)
 expect(within(screen.getByTestId('integrations-list')).getAllByTestId('integration-inline-ai')).toHaveLength(1)
})
