import { readOverview, readProvider, readGoogle, readCalendars, validIdentifier, validOAuthCallback, readOAuthUrl, statusPresentation } from './integrationContract'
const envelope = (data: unknown) => ({ success: true, data })
const google = { available: true, connected: true, enabled: false, calendarId: 'primary', calendarName: 'Рабочий', deleteCanceledFromCalendar: false, skipTransferredFromCalendar: true, reminders: { useDefault: true, overrides: [] } }
const provider = { available: true, configured: true, enabled: true, status: 'connected' }
it('unknown/invalid DTO никогда не выдаётся за отключение; overview ИИ проигнорирован', () => {
  expect(readOverview(envelope({ googleCalendar: google, avito: provider, vk: { ...provider, enabled: 'false' }, ai: provider }))).toEqual({ 'google-calendar': google, avito: provider })
  expect(statusPresentation(undefined).label).toBe('Статус неизвестен')
  expect(statusPresentation(google).label).toBe('Приостановлено')
  expect(statusPresentation({ ...provider, status: 'auth_error' }).label).toBe('Ошибка подключения')
  expect(statusPresentation({ ...provider, status: 'bot_ready' }).label).toBe('Бот настроен')
})
it.each([undefined, null, [], { success: false, data: {} }, { success: true }, { success: 'true', data: {} }])('invalid envelope %p rejected', (response) => expect(() => readOverview(response)).toThrow())
it('проецирует только безопасные поля, включая legacy-провайдера без админ-возможностей', () => {
  const state = readProvider('ai', { ...provider, analysisProvider: 'deepseek', canUseDeepseek: true, key: 'secret', adminUsage: [1], coefficient: 2 })
  expect(state.analysisProvider).toBe('deepseek'); expect(state).not.toHaveProperty('key'); expect(state).not.toHaveProperty('canUseDeepseek'); expect(state).not.toHaveProperty('adminUsage'); expect(state).not.toHaveProperty('coefficient')
})
it('конкретные public key IDs, дубли и повреждённые метаданные', () => {
  const key = { id: 'key-id', name: 'Сайт', enabled: true, lastFour: '1234' }
  expect(readProvider('public-leads', { ...provider, keys: [key], issuedKey: 'secret' }).keys).toEqual([key])
  for (const keys of [[key, key], [{ ...key, id: '' }], [{ ...key, enabled: 'true' }], [{ ...key, lastFour: 'secret' }]]) expect(() => readProvider('public-leads', { ...provider, keys })).toThrow()
  expect(() => readProvider('vk', { ...provider, provider: 'avito' })).toThrow()
})
it('не принимает неполные Google/reminder/calendar DTO вместо пустого списка', () => {
  expect(() => readGoogle({ ...google, reminders: undefined })).toThrow()
  expect(() => readGoogle({ ...google, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] } })).toThrow()
  expect(() => readCalendars(envelope({ calendars: undefined, selectedId: 'primary' }))).toThrow()
  expect(() => readCalendars(envelope({ calendars: [{ id: 'calendar', primary: 'true' }], selectedId: 'primary' }))).toThrow()
  expect(readCalendars(envelope({ calendars: [], selectedId: 'primary' }))).toEqual([])
})
it.each([' token', 'token ', 'two words', 'x\n', '', 'x'.repeat(501)])('не нормализует исходный токен %p', (token) => expect(validIdentifier(token)).toBe(false))
it('не теряет ведущие нули и не выдумывает numeric-контракт', () => { expect(validIdentifier('00123')).toBe(true); expect(validIdentifier('original-token:123')).toBe(true) })
it.each(['vedelo', 'artistcrm', 'vedelo-dev', 'artistcrm-dev'])('OAuth exact scheme/path/query %s', (scheme) => {
  expect(validOAuthCallback(`${scheme}://more/integrations?gc_connected=1`, scheme)).toBe(true)
  for (const url of [`https://more/integrations?gc_connected=1`, `${scheme}://other/integrations?gc_connected=1`, `${scheme}://more/integrations/extra?gc_connected=1`, `${scheme}://more/integrations?gc_connected=10`, `${scheme}://more/integrations?gc_connected=1&gc_error=state`, `${scheme}://more/integrations?gc_connected=1&gc_connected=1`, `${scheme}://more/integrations?gc_connected=1#token`, `${scheme}://more/integrations?gc_error=exchange`]) expect(validOAuthCallback(url, scheme)).toBe(false)
})
it.each(['https://evil.example/auth?state=x', 'http://accounts.google.com/o/oauth2/v2/auth?state=x', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth?state=x', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://accounts.google.com/o/oauth2/v2/auth?state=x&access_token=secret'])('OAuth auth URL rejects %p', (url) => expect(() => readOAuthUrl(envelope({ url }))).toThrow())
it('валидный auth URL без bearer', () => expect(readOAuthUrl(envelope({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed-state' }))).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=signed-state'))
