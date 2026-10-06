import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { CalendarImportSection } from './CalendarImportSection'
import { calendarImportEntry } from './calendarImportApi'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { exportDeferred } from './exportFixtures'
let mockFocus = true, mockUser: any = { _id: 'a', tenantId: 'ta' }
jest.mock('expo-router', () => ({ useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocus ? fn() : undefined, [fn, mockFocus]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider forcedMode={mode} storage={null}><CalendarImportSection /></ThemeProvider>
beforeEach(() => { jest.clearAllMocks(); mockFocus = true; mockUser = { _id: 'a', tenantId: 'ta' }; jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined) })
afterEach(() => jest.restoreAllMocks())
it.each(['light', 'dark'] as const)('честная граница %s без native подключения/статусов/смет', async mode => {
  const screen = render(draw(mode)); expect(screen.getByText(/Обычная синхронизация Google/)).toBeTruthy(); expect(screen.queryByText('Подключён')).toBeNull(); expect(screen.queryByText('Запустить импорт')).toBeNull()
  fireEvent.press(screen.getByText('Открыть Google-импорт в web')); await act(async () => {})
  expect(Linking.openURL).toHaveBeenCalledWith('https://vedelo.ru/cabinet/import'); expect(calendarImportEntry.nativeSupported).toBe(false)
  const url = new URL((Linking.openURL as jest.Mock).mock.calls[0][0]); expect(url.search).toBe(''); expect(url.hash).toBe(''); expect(url.username).toBe(''); expect(url.password).toBe(''); screen.unmount()
})
it('повторы заблокированы, late error после blur/profile switch скрыт', async () => {
  const wait = exportDeferred<any>(); (Linking.openURL as jest.Mock).mockReturnValueOnce(wait.promise); const screen = render(draw()); fireEvent.press(screen.getByText('Открыть Google-импорт в web')); fireEvent.press(screen.getByText('Открыть Google-импорт в web')); expect(Linking.openURL).toHaveBeenCalledTimes(1)
  mockFocus = false; screen.rerender(draw()); mockUser = { _id: 'b' }; mockFocus = true; screen.rerender(draw()); await act(async () => wait.reject(new Error('SECRET')))
  expect(screen.queryByText(/Не удалось открыть/)).toBeNull(); expect(screen.queryByText('SECRET')).toBeNull(); screen.unmount()
})
it('ошибка позволяет retry без сообщения об импорте', async () => {
  (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('SECRET')); const screen = render(draw()); fireEvent.press(screen.getByText('Открыть Google-импорт в web')); await screen.findByText(/Не удалось открыть web-кабинет/)
  fireEvent.press(screen.getByText('Открыть Google-импорт в web')); await act(async () => {}); expect(Linking.openURL).toHaveBeenCalledTimes(2); screen.unmount()
})
it('код repo подтверждает web cookie import и отдельный mobile sync', () => {
  const root = path.resolve(__dirname, '../../../../'), read = (name: string) => fs.readFileSync(path.join(root, name), 'utf8')
  for (const route of ['import-status', 'import-calendars', 'import-select', 'auth-url']) expect(read(`app/api/google-calendar/${route}/route.js`)).toContain('getTenantContext()')
  expect(read('app/api/google-calendar/auth-url/route.js')).toContain("response.cookies.set('gc_oauth_state'")
  expect(read('app/api/google-calendar/callback/route.js')).toContain("req.cookies.get('gc_oauth_state')")
  expect(read('app/api/mobile/v1/integrations/google-calendar/auth-url/route.js')).toContain('scope: [WRITE_SCOPE]')
  expect(read('server/mobile/googleCalendarOAuth.js')).toContain('user.googleCalendar ='); expect(read('server/mobile/googleCalendarOAuth.js')).not.toContain('user.googleCalendarImport =')
  expect(read('layouts/content/contentsMap.js')).toContain('import: {'); expect(read('components/GoogleCalendarImportSettings.js')).toContain("const redirect = '/cabinet/import'")
  const own = read('mobile/src/features/import/calendarImportApi.ts'); expect(own).not.toContain('api.get('); expect(own).not.toContain('auth-url?')
})
