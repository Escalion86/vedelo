import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Linking } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewsScreen from '../../../app/more/news'
import { NewsNotice } from './NewsNotice'
import { NewsContent } from './NewsContent'
import { readNews } from './useNews'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { pendingNativeIntent, resetNativeIntents } from '../../shared/native/intents'
require('../../../__tests__/stageN/nativeHosts.cjs').initializeNativeHosts(render)
const mockGet = jest.fn(), mockPost = jest.fn(), mockPush = jest.fn()
let mockUser = { _id: 'a'.repeat(24), tenantId: 'a'.repeat(24) }, mockEpoch = 1
jest.mock('react-native-webview', () => ({ __esModule: true, default: (props: any) => require('react').createElement(require('react-native').View, props) }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser, authenticated: true }) }))
jest.mock('../../shared/auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://vedelo.ru/api' } }))
jest.mock('../../shared/api/client', () => ({ api: { request: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } }))
const newest = { _id: '1'.repeat(24), title: 'Новые возможности', version: '1.46', publishedAt: '2026-01-02T10:00:00.000Z', contentHtml: '<p>Описание <strong>новости</strong></p>' }
const older = { ...newest, _id: '2'.repeat(24), title: 'Ранняя новость', publishedAt: '2026-01-01T10:00:00.000Z' }
const data = () => ({ items: [newest, older], lastSeenNewsAt: null })
const ok = (data: unknown) => ({ success: true, data })
const setup = (mode: 'light' | 'dark' = 'light', notice = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const draw = () => <QueryClientProvider client={client}><ThemeProvider forcedMode={mode} storage={null}>{notice ? <NewsNotice /> : <NewsScreen />}</ThemeProvider></QueryClientProvider>
  return { client, draw, screen: render(draw()) }
}
beforeEach(() => {
  jest.clearAllMocks(); resetNativeIntents(); mockEpoch = 1; mockUser = { _id: 'a'.repeat(24), tenantId: 'a'.repeat(24) }
  mockGet.mockResolvedValue(ok(data())); mockPost.mockImplementation(async (_path, body) => ok({ lastSeenNewsAt: body.seenAt }))
})
it.each(['light', 'dark'] as const)('opens latest unread with local rich text; mark is shared with PWA (%s)', async mode => {
  const { screen, client } = setup(mode)
  await screen.findByText(newest.title)
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/news/seen', { seenAt: newest.publishedAt }))
  expect(screen.getByTestId('news-content').props.source.html).toContain(newest.contentHtml)
  expect(screen.getByTestId('news-content').props.javaScriptEnabled).toBe(false)
  expect(screen.getByTestId('news-content').props.source.html).toContain(`color-scheme:${mode}`)
  await waitFor(() => expect(client.getQueryData(['user-news', mockUser.tenantId, mockUser._id])).toMatchObject({ lastSeenNewsAt: newest.publishedAt }))
  fireEvent.press(screen.getByText('Все новости')); fireEvent.press(screen.getByLabelText(`Читать: ${older.title}`))
  expect(screen.getByText(older.title)).toBeTruthy(); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('notice does not mark news read before opening it', async () => {
  const { screen } = setup('light', true)
  await screen.findByText(`Что нового: 2 · ${newest.title}`)
  expect(mockPost).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Прочитать новости Ведело')); expect(mockPush).toHaveBeenCalledWith('/more/news')
})
it('failed marker can be retried without hiding unread state', async () => {
  mockPost.mockRejectedValueOnce(Error('offline'))
  const { screen, client } = setup()
  await screen.findByText('Новости открыты, но отметка прочтения не сохранена.')
  expect(client.getQueryData(['user-news', mockUser.tenantId, mockUser._id])).toMatchObject({ lastSeenNewsAt: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Повторить отметку прочтения' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Повторить отметку прочтения'))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText('Новости открыты, но отметка прочтения не сохранена.')).toBeNull())
  expect(mockPost).toHaveBeenCalledTimes(2)
})
it('late marker does not repopulate the cache after logout/account change', async () => {
  let resolve!: (value: unknown) => void
  mockPost.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const { screen, client } = setup(); await waitFor(() => expect(resolve).toBeDefined())
  screen.unmount(); client.clear(); mockEpoch++
  await act(async () => resolve(ok({ lastSeenNewsAt: newest.publishedAt })))
  expect(client.getQueryCache().getAll()).toHaveLength(0)
})
it('invalid response is not presented as no news', async () => {
  mockGet.mockResolvedValue(ok({ items: [], lastSeenNewsAt: 'broken-date' }))
  const { screen } = setup()
  await screen.findByText('Не удалось обновить новости. Проверьте подключение.')
  expect(screen.queryByText('Новостей пока нет')).toBeNull(); expect(mockPost).not.toHaveBeenCalled()
  expect(() => readNews(ok({ ...data(), items: [newest, newest] }))).toThrow()
})
it('links route CRM through the guarded intent queue; external URLs need an explicit tap', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}), external = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  const screen = render(<NewsContent html="<p>Новость</p>" />)
  const view = screen.getByTestId('news-content')
  expect(view.props.allowFileAccess).toBe(false); expect(view.props.sharedCookiesEnabled).toBe(false)
  for (const url of ['file:///private', 'javascript:alert(1)', 'https://user:secret@example.test']) expect(view.props.onShouldStartLoadWithRequest({ url })).toBe(false)
  expect(alert).not.toHaveBeenCalled()
  view.props.onShouldStartLoadWithRequest({ url: 'vedelo://native/settings' })
  expect(pendingNativeIntent()?.destination.href).toBe('/native/settings')
  view.props.onShouldStartLoadWithRequest({ url: 'https://example.test/news' })
  expect(alert).toHaveBeenCalled(); expect(external).not.toHaveBeenCalled()
  const buttons = alert.mock.calls.at(-1)?.[2]
  buttons?.find(button => button.text === 'Открыть')?.onPress?.()
  expect(external).toHaveBeenCalledWith('https://example.test/news')
  alert.mockRestore(); external.mockRestore()
})
