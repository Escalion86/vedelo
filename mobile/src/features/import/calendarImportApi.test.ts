import { calendarRange, connectImportCalendar, importCalendarBatch } from './calendarImportApi'
const mockGet = jest.fn(), mockPost = jest.fn(), mockOpen = jest.fn()
let mockEpoch = 0
jest.mock('../../shared/api/client', () => ({ api: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a) } }))
jest.mock('../../shared/config/env', () => ({ env: { appScheme: 'vedelo-dev' } }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: any[]) => mockOpen(...a) }))
beforeEach(() => { jest.clearAllMocks(); mockEpoch = 0; mockGet.mockResolvedValue({ success: true, data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed' } }) })
it('validates real inclusive dates and bounded range', () => {
  expect(calendarRange('2026-01-01', '2026-01-01').timeMax).not.toBe(calendarRange('2026-01-01', '2026-01-01').timeMin)
  for (const pair of [['2026-02-30', '2026-03-02'], ['2026-01-02', '2026-01-01'], ['2025-01-01', '2026-02-01'], ['invalid', '2026-01-01']]) expect(() => calendarRange(pair[0], pair[1])).toThrow()
})
it('connects with import purpose and rejects a sync/foreign callback', async () => {
  mockOpen.mockResolvedValue({ type: 'success', url: 'vedelo-dev://more/import?gc_import_connected=1' }); await connectImportCalendar(() => true)
  expect(mockGet.mock.calls[0][0]).toContain('purpose=import'); expect(mockOpen.mock.calls[0][1]).toBe('vedelo-dev://more/import')
  mockOpen.mockResolvedValue({ type: 'success', url: 'vedelo-dev://more/integrations?gc_connected=1' }); await expect(connectImportCalendar(() => true)).rejects.toThrow()
})
it('does not open browser after identity change', async () => {
  mockGet.mockImplementationOnce(async () => { mockEpoch++; return { success: true, data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed' } } })
  await connectImportCalendar(() => true); expect(mockOpen).not.toHaveBeenCalled()
})
it('sends only accepted fields with expected source calendar', async () => {
  mockPost.mockResolvedValue({ success: true, data: { results: [], actualCost: 0 } })
  await importCalendarBatch({ calendarId: 'own', groupId: 'saved', eventIds: ['g1'], timeMin: 'from', timeMax: 'to', preview: 'private-cache' } as any)
  expect(mockPost).toHaveBeenCalledWith('/events/google-import', { calendarId: 'own', groupId: 'saved', eventIds: ['g1'], timeMin: 'from', timeMax: 'to' }, { skipRefresh: true })
})
