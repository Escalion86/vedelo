import React from 'react'
import { act, configure, fireEvent, render, waitFor } from '@testing-library/react-native'
import { ProposalEditorScreen } from './ProposalEditorScreen'
configure({ asyncUtilTimeout: 5000 })
const mockTemplate = jest.fn(), mockPreview = jest.fn(), mockSave = jest.fn(), mockUpload = jest.fn(), mockPicker = jest.fn()
let mockUser = { _id: 'u1', tenantId: 't1' }
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }))
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: jest.fn() }) }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: any[]) => mockPicker(...a) }))
jest.mock('./api', () => ({ proposalsApi: {
 template: (...a: any[]) => mockTemplate(...a), services: async () => [],
 previewTemplate: (...a: any[]) => mockPreview(...a), saveTemplate: (...a: any[]) => mockSave(...a),
 uploadMedia: (...a: any[]) => mockUpload(...a),
} }))
// Only the native WebView host is replaced. The real editor, rich editor, picker
// continuation and local document builder run inside the actual identity boundary.
jest.mock('./LocalWebView', () => ({ LocalWebView: () => null }))
jest.mock('./ProposalPreview', () => ({ ProposalPreview: ({ data }: any) => require('react').createElement(require('react-native').Text, { testID: 'session-preview' }, data.title) }))
const template = {
 _id: 'template', name: 'Старый шаблон', status: 'active',
 blocks: [{ id: 'intro', type: 'intro', contentHtml: '<p>Старый текст</p>' }],
 media: [{ id: 'media', kind: 'image', title: 'Старое медиа', url: 'https://synthetic.invalid/photo.png' }],
 defaults: { packages: [{ id: 'main', title: 'Вариант', lines: [], total: 0 }], servicesIds: [] }, messageTemplate: '',
}
const fresh = { ...template, name: 'Новый шаблон', media: [], blocks: [] }
function deferred() { let resolve!: (v: any) => void; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => { mockUser = { _id: 'u1', tenantId: 't1' }; jest.clearAllMocks(); mockTemplate.mockReset().mockResolvedValue(template); mockPreview.mockReset(); mockSave.mockReset(); mockUpload.mockReset(); mockPicker.mockReset() })
function replaceIdentity(s: ReturnType<typeof render>) {
 mockUser = { _id: 'u2', tenantId: 't2' }; mockTemplate.mockResolvedValue(fresh)
 s.rerender(<ProposalEditorScreen kind="template" id="template" />)
}
it('C-SESSION-01 actual rich editor picker cannot upload after identity replacement', async () => {
 const picker = deferred(); mockPicker.mockReturnValue(picker.promise)
 const s = render(<ProposalEditorScreen kind="template" id="template" />)
 await s.findByDisplayValue('Старый шаблон'); fireEvent.press(s.getByTestId('proposal-richtext-image'))
 replaceIdentity(s); await s.findByDisplayValue('Новый шаблон')
 await act(async () => picker.resolve({ canceled: false, assets: [{ uri: 'file:///x', name: 'x.png', mimeType: 'image/png', size: 10 }] }))
 expect(mockUpload).not.toHaveBeenCalled(); expect(s.queryByText('Старое медиа')).toBeNull()
})
it('C-SESSION-01 visible preview and media are cleared; late preview cannot reopen modal', async () => {
 mockPreview.mockResolvedValueOnce({ title: 'Старый предпросмотр' })
 const s = render(<ProposalEditorScreen kind="template" id="template" />)
 await s.findByDisplayValue('Старый шаблон'); fireEvent.press(s.getByTestId('proposal-preview'))
 await s.findByText('Старый предпросмотр'); replaceIdentity(s)
 await s.findByDisplayValue('Новый шаблон'); expect(s.queryByText('Старый предпросмотр')).toBeNull(); expect(s.queryByText('Старое медиа')).toBeNull()
 const preview = deferred(); mockPreview.mockReturnValueOnce(preview.promise)
 fireEvent.press(s.getByTestId('proposal-preview'))
 mockUser = { _id: 'u3', tenantId: 't3' }; s.rerender(<ProposalEditorScreen kind="template" id="template" />)
 await act(async () => preview.resolve({ title: 'Запоздалый предпросмотр' }))
 expect(s.queryByText('Запоздалый предпросмотр')).toBeNull()
})
it('C-SESSION-01 late save cannot rehydrate old draft; next write contains only replacement user draft', async () => {
 const saving = deferred(); mockSave.mockReturnValueOnce(saving.promise).mockResolvedValueOnce(fresh)
 const s = render(<ProposalEditorScreen kind="template" id="template" />)
 await s.findByDisplayValue('Старый шаблон'); fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Чужой ввод')
 fireEvent.press(s.getByTestId('proposal-save')); await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
 replaceIdentity(s); await s.findByDisplayValue('Новый шаблон')
 await act(async () => saving.resolve({ ...template, name: 'Чужой ввод' }))
 expect(s.queryByDisplayValue('Чужой ввод')).toBeNull()
 fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Ввод нового пользователя'); fireEvent.press(s.getByTestId('proposal-save'))
 await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
 expect(mockSave.mock.calls[1][1]).toMatchObject({ name: 'Ввод нового пользователя', media: [] })
})
