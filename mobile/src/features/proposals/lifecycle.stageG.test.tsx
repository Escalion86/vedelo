import React from 'react'
import { Alert } from 'react-native'
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react-native'
import { ProposalEditorScreen } from './ProposalEditorScreen'
import { ProposalTemplatesScreen } from './ProposalTemplatesScreen'
import { EventProposalsSection } from './EventProposalsSection'
import { proposalsApi } from './api'
configure({ asyncUtilTimeout: 5000 })
const mockRequest = jest.fn(), mockUpload = jest.fn(), mockPicker = jest.fn(), mockPush = jest.fn()
let mockDatabase: any
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => mockDatabase ||= require('../../../__tests__/sqlitePlatform.cjs')() }))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => 'synthetic-key', WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1 }))
jest.mock('expo-file-system', () => ({ Directory: class { exists = false }, Paths: { document: 'unused' } }))
jest.mock('expo-crypto', () => ({ randomUUID: () => process.getBuiltinModule('node:crypto').randomUUID() }))
let mockUser = { _id: 'u1', tenantId: 't1' }, mockFocused = true
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
let mockSessionSequence = 0
jest.mock('../../shared/auth/tokenStore', () => ({ getStoredUser: async () => mockUser, getAccessToken: async () => 'fixture-credential', subscribeAuthSession: () => () => {} }))
jest.mock('../../shared/api/client', () => ({ api: { request: (path: string, options: any) => mockRequest(path, options?.method ? { method: options.method, skipRefresh: options.skipRefresh, ...(options.body !== undefined ? { body: options.body } : {}) } : undefined), upload: (...a: any[]) => mockUpload(...a) } }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: any[]) => mockPicker(...a) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }))
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), router: { push: (...a: any[]) => mockPush(...a) }, useFocusEffect: (fn: any) => require('react').useEffect(() => mockFocused ? fn() : undefined, [fn, mockFocused]) }))
jest.mock('./RichTextEditor', () => ({ RichTextEditor: () => null }))
jest.mock('./ProposalPreview', () => ({ ProposalPreview: ({ data }: any) => require('react').createElement(require('react-native').Text, null, data.title) }))
const pack = { id: 'main', title: 'Основной', lines: [], total: 0 }
const template = { _id: 'template', name: 'Старый шаблон', status: 'active', blocks: [], media: [], messageTemplate: '', defaults: { packages: [pack], servicesIds: [] } }
const proposal = { _id: 'created', eventId: 'event', title: 'КП', version: 1, status: 'draft', blocksSnapshot: [], mediaSnapshot: [], packages: [pack], messageText: '' }
const data = (value: any) => ({ success: true, data: value })
function deferred() { let resolve!: (v: any) => void; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function reads(path: string) {
 if (path === '/services') return data([])
 if (path === '/proposal-templates/defaults') return data(template)
 if (path === '/proposal-templates') return data([template])
 if (path.startsWith('/proposal-templates/')) return data(template)
 if (path === '/events/event/proposals') return data([])
 if (path === '/mobile/v1/events/event') return data({ _id: 'event', status: 'active' })
 if (path === '/proposals/created') return data(proposal)
 throw Error(path)
}
beforeEach(async () => { mockUser = { _id: `u1-${++mockSessionSequence}`, tenantId: 't1' }; mockFocused = true; jest.clearAllMocks(); mockRequest.mockReset().mockImplementation(async path => reads(path)); await require('../../shared/storage/database').clearLocalData() })
it.each(['user', 'tenant'])('C-SESSION-01 editor resets draft and rejects late load on %s change', async field => {
 const late = deferred(); mockRequest.mockImplementationOnce(() => Promise.resolve(data([])))
 const s = render(<ProposalEditorScreen kind="template" id="template" />)
 await s.findByDisplayValue('Старый шаблон'); fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Чужой черновик')
 mockRequest.mockImplementation(async path => path === '/proposal-templates/template' ? late.promise : reads(path))
 mockUser = field === 'user' ? { _id: 'u2', tenantId: 't1' } : { _id: 'u1', tenantId: 't2' }
 s.rerender(<ProposalEditorScreen kind="template" id="template" />)
 expect(s.queryByDisplayValue('Чужой черновик')).toBeNull()
 await act(async () => late.resolve(data({ ...template, name: 'Новый tenant' })))
 await s.findByDisplayValue('Новый tenant')
})
it('C-SESSION-01 deferred old defaults cannot hydrate new identity or send old draft', async () => {
 const old = deferred(); let first = true
 mockRequest.mockImplementation(async path => path === '/proposal-templates/defaults' && first ? (first = false, old.promise) : reads(path))
 const s = render(<ProposalEditorScreen kind="template" id="new" />)
 await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('/proposal-templates/defaults', undefined))
 mockUser = { _id: 'u2', tenantId: 't2' }; s.rerender(<ProposalEditorScreen kind="template" id="new" />)
 await s.findByLabelText('Название шаблона')
 await act(async () => old.resolve(data({ ...template, messageTemplate: 'Чужой текст' })))
 expect(s.queryByDisplayValue('Чужой текст')).toBeNull()
})
it('C-SESSION-01 picker continuation does not upload under replacement identity', async () => {
 const picked = deferred(); mockPicker.mockReturnValue(picked.promise)
 const s = render(<ProposalEditorScreen kind="template" id="template" />)
 await s.findByDisplayValue('Старый шаблон'); fireEvent.press(s.getByText('Добавить фото в медиа'))
 mockUser = { _id: 'u2', tenantId: 't2' }; s.rerender(<ProposalEditorScreen kind="template" id="template" />)
 await act(async () => picked.resolve({ canceled: false, assets: [{ uri: 'file:///x', name: 'x.png', mimeType: 'image/png', size: 10 }] }))
 expect(mockUpload).not.toHaveBeenCalled()
})
it.each(['templates', 'section'])('C-SESSION-01 %s rejects late old list', async kind => {
 const old = deferred(); let first = true
 const path = kind === 'templates' ? '/proposal-templates' : '/events/event/proposals'
 mockRequest.mockImplementation(async p => p === path ? (first ? (first = false, old.promise) : data([])) : reads(p))
 const element = kind === 'templates' ? <ProposalTemplatesScreen /> : <EventProposalsSection eventId="event" />
 const s = render(element); await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(path, undefined))
 mockUser = { _id: 'u2', tenantId: 't2' }; s.rerender(kind === 'templates' ? <ProposalTemplatesScreen /> : <EventProposalsSection eventId="event" />)
 await act(async () => old.resolve(data(kind === 'templates' ? [template] : [proposal])))
 expect(s.queryByText(kind === 'templates' ? 'Старый шаблон' : 'КП')).toBeNull()
})
it('C-SESSION-01 mutation continuation stops before readback after identity replacement', async () => {
 const write = deferred(); mockRequest.mockReturnValueOnce(write.promise)
 const pending = proposalsApi.create('event', {}); await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1))
 mockUser = { _id: 'u2', tenantId: 't2' }; write.resolve(data(proposal))
 await expect(pending).rejects.toThrow(); expect(mockRequest).toHaveBeenCalledTimes(1)
})
it.each(['known', 'lost'])('C-CREATE-01 opened choices, double press and blur/focus preserve %s create guard', async mode => {
 let wrote = false
 mockRequest.mockImplementation(async (path, options) => {
  if (options?.method === 'POST') { wrote = true; if (mode === 'lost') throw Error('lost response'); return data(proposal) }
  if (path === '/proposals/created' && wrote) throw Error('readback down')
  return reads(path)
 })
 const s = render(<EventProposalsSection eventId="event" />)
 await s.findByText('Предложений пока нет'); fireEvent.press(s.getByTestId('proposal-create'))
 fireEvent.press(s.getByText('Без шаблона')); fireEvent.press(s.getByText('Без шаблона'))
 await waitFor(() => expect(s.getAllByText(/Действие не подтверждено|Результат создания|Создание не подтверждено/)).toBeTruthy())
 fireEvent.press(s.getByText('Старый шаблон'))
 expect(mockRequest.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1)
 mockFocused = false; s.rerender(<EventProposalsSection eventId="event" />)
 mockFocused = true; s.rerender(<EventProposalsSection eventId="event" />)
 await waitFor(() => expect(s.getByTestId('proposal-create').props.accessibilityState.disabled).toBe(true))
 if (mode === 'known') {
  mockRequest.mockImplementation(async path => reads(path))
  fireEvent.press(s.getByText('Повторить чтение созданного КП'))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event/proposals/created'))
 }
 expect(mockRequest.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1)
})
it.each(['known', 'lost'])('C-CREATE-01 new template %s failure retry never repeats a write', async mode => {
 let wrote = false
 mockRequest.mockImplementation(async (path, options) => {
  if (options?.method === 'POST') { wrote = true; if (mode === 'lost') throw Error('lost response'); return data(template) }
  if (path === '/proposal-templates/template' && wrote) throw Error('readback down')
  return reads(path)
 })
 const s = render(<ProposalEditorScreen kind="template" id="new" />)
 await s.findByLabelText('Название шаблона'); fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Не потерять')
 fireEvent.press(s.getByTestId('proposal-save')); fireEvent.press(s.getByTestId('proposal-save'))
 await s.findAllByText(/Не удалось сохранить|Результат создания|Создание не подтверждено/)
 fireEvent.press(s.getByTestId('proposal-save'))
 await act(async () => {})
 expect(mockRequest.mock.calls.filter(c => c[1]?.method)).toHaveLength(1)
 if (mode === 'known') {
  mockRequest.mockImplementation(async path => reads(path)); fireEvent.press(s.getByText('Повторить чтение созданного шаблона'))
  await s.findByText('Сохранено'); expect(mockRequest.mock.calls.filter(c => c[1]?.method)).toHaveLength(1)
 }
})
it('C-CREATE-01 every non-idempotent write opts out of automatic refresh replay', async () => {
 mockRequest.mockResolvedValue(data(proposal)); await proposalsApi.create('event', {})
 expect(mockRequest.mock.calls[0][1]).toMatchObject({ skipRefresh: true })
})
it('C-CREATE-01 confirmed create permits a subsequent intentional create after refocus', async () => {
 mockRequest.mockImplementation(async (path, options) => options?.method === 'POST' ? data(proposal) : reads(path))
 const s = render(<EventProposalsSection eventId="event" />)
 await s.findByText('Предложений пока нет'); fireEvent.press(s.getByTestId('proposal-create')); fireEvent.press(s.getByText('Без шаблона'))
 await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
 mockFocused = false; s.rerender(<EventProposalsSection eventId="event" />)
 mockFocused = true; s.rerender(<EventProposalsSection eventId="event" />)
 await waitFor(() => expect(s.getByTestId('proposal-create').props.accessibilityState.disabled).toBe(false))
 fireEvent.press(s.getByTestId('proposal-create')); fireEvent.press(s.getByText('Без шаблона'))
 await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2))
 expect(mockRequest.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(2)
})
it.each(['proposal', 'template'])('cancellation of %s survives remount without silently resuming creation', async kind => {
 let cancellations = 0
 mockRequest.mockImplementation(async (path, options) => {
  if (path.endsWith('/cancel')) { if (++cancellations === 1) throw Error('reply lost'); return data({ state: 'cancelled' }) }
  if (options?.method === 'POST') throw Error('create reply lost')
  return reads(path)
 })
 const element = () => kind === 'proposal' ? <EventProposalsSection eventId="event" /> : <ProposalEditorScreen kind="template" id="new" />
 let screen = render(element())
 if (kind === 'proposal') {
  await screen.findByText('Предложений пока нет')
  fireEvent.press(screen.getByTestId('proposal-create')); fireEvent.press(screen.getByText('Без шаблона'))
 } else {
  fireEvent.changeText(await screen.findByLabelText('Название шаблона'), 'Сохранить ввод')
  fireEvent.press(screen.getByTestId('proposal-save'))
 }
 const cancel = await screen.findByText('Отменить попытку создания')
 await waitFor(() => expect(screen.getByTestId(kind === 'proposal' ? 'proposal-create' : 'proposal-save').props.accessibilityState.disabled).toBe(true))
 const alert = jest.spyOn(Alert, 'alert')
 fireEvent.press(cancel)
 act(() => alert.mock.calls[0][2]?.find(button => button.text === 'Отменить попытку')?.onPress?.())
 await screen.findByText('Завершить отмену')
 await waitFor(() => expect(cancellations).toBe(1))
 screen.unmount()
 require('./operations').proposalOperations.clear(JSON.stringify([mockUser._id, mockUser.tenantId]), kind === 'proposal' ? 'create-proposal' : 'create-template', kind === 'proposal' ? 'event' : 'new')
 screen = render(element())
 const finish = await screen.findByText('Завершить отмену')
 expect(screen.queryByText(kind === 'proposal' ? 'Продолжить создание КП' : 'Продолжить создание шаблона')).toBeNull()
 if (kind === 'template') expect(screen.getByDisplayValue('Сохранить ввод')).toBeTruthy()
 fireEvent.press(finish)
 await screen.findByText(kind === 'proposal' ? 'Попытка создания отменена.' : 'Попытка создания отменена. Можно изменить форму и сохранить заново.')
 await waitFor(() => expect(screen.getByTestId(kind === 'proposal' ? 'proposal-create' : 'proposal-save').props.accessibilityState.disabled).toBe(false))
 expect(mockRequest.mock.calls.filter(([path, options]) => options?.method === 'POST' && !path.endsWith('/cancel'))).toHaveLength(1)
 alert.mockRestore()
})
