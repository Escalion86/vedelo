jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'test-user', tenantId: 'test-tenant' } }) }))
import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
const mockSave = jest.fn()
const mockGetTemplate = jest.fn()
const mockPreview = jest.fn()
const mockServices = jest.fn()
const mockPreventRemove = jest.fn()
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (enabled: boolean, callback: any) =>
    mockPreventRemove(enabled, callback),
}))
const mockNavigation = {
  addListener: jest.fn((_type: string, _listener: any) => jest.fn()),
  dispatch: jest.fn(),
}
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  router: { back: jest.fn(), replace: jest.fn() },
}))
jest.mock(
  './api',
  () => ({
    proposalsApi: {
      template: (...a: any[]) => mockGetTemplate(...a.slice(0, 1)),
      saveTemplate: (...a: any[]) => mockSave(...a.slice(0, 2)),
      previewTemplate: (...a: any[]) => mockPreview(...a.slice(0, 2)),
      services: () => mockServices(),
    },
  })
)
jest.mock(
  './RichTextEditor',
  () => ({
    RichTextEditor: ({ value, onChange }: any) =>
      require('react').createElement(require('react-native').TextInput, {
        testID: 'visual-editor-fixture',
        value,
        onChangeText: onChange,
      }),
  })
)
jest.mock(
  './ProposalPreview',
  () => ({
    ProposalPreview: ({ data }: any) =>
      require('react').createElement(
        require('react-native').Text,
        { testID: 'preview' },
        data.title
      ),
  })
)
let subject: any = {}
try {
  subject = require('./ProposalEditorScreen')
} catch (error) {
  if (
    !String((error as { message?: string })?.message).includes(
      "Cannot find module './ProposalEditorScreen'"
    )
  )
    throw error
}
const html =
  '<p>Исходный текст</p><img src="https://cloud.escalion.ru/uploads/a.png"><video src="https://cloud.escalion.ru/uploads/a.mp4" controls></video>'
const template = {
  _id: 't',
  name: 'Шаблон',
  status: 'active',
  blocks: [
    {
      id: 'intro',
      type: 'intro',
      title: 'Вступление',
      contentHtml: html,
      enabled: true,
    },
  ],
  media: [{ id: 'm', kind: 'image', url: 'https://example.invalid/a.png' }],
  defaults: {
    packages: [
      {
        id: 'main',
        title: 'Основной',
        description: '',
        lines: [],
        total: 0,
        manualTotal: false,
        recommended: true,
      },
    ],
    servicesIds: [],
  },
  messageTemplate: 'Сообщение',
}
function draw(mode: 'light' | 'dark' = 'light') {
  expect(subject.ProposalEditorScreen).toBeDefined()
  const Editor = subject.ProposalEditorScreen
  return render(
    <ThemeProvider storage={null} forcedMode={mode}>
      <Editor kind="template" id="t" />
    </ThemeProvider>
  )
}
beforeEach(() => {
  jest.clearAllMocks()
  mockGetTemplate.mockResolvedValue(template)
  mockServices.mockResolvedValue([])
  mockSave.mockResolvedValue(template)
  mockPreview.mockResolvedValue({
    title: 'Клиентский вид',
    blocks: [],
    packages: [],
    media: [],
  })
})
it.each(['light', 'dark'] as const)(
  'title edit %s keeps rich media and snapshots in full payload',
  async (mode) => {
    const screen = draw(mode)
    await screen.findByDisplayValue('Шаблон')
    fireEvent.changeText(screen.getByLabelText('Название шаблона'), 'Новое имя')
    fireEvent.press(screen.getByTestId('proposal-save'))
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0]).toBe('t')
    expect(mockSave.mock.calls[0][1]).toMatchObject({
      name: 'Новое имя',
      blocks: template.blocks,
      media: template.media,
      defaults: template.defaults,
    })
  }
)
it('network failure retains typed draft and does not report save success', async () => {
  mockSave.mockRejectedValueOnce(Error('network'))
  const screen = draw()
  await screen.findByDisplayValue('Шаблон')
  fireEvent.changeText(screen.getByLabelText('Название шаблона'), 'Не потерять')
  fireEvent.press(screen.getByTestId('proposal-save'))
  await screen.findByText(
    'Не удалось сохранить. Введённые данные сохранены на экране.'
  )
  expect(screen.getByDisplayValue('Не потерять')).toBeTruthy()
  expect(screen.queryByText('Сохранено')).toBeNull()
})
it('unsaved preview uses actual draft; preview failure not presented as saved', async () => {
  const screen = draw()
  await screen.findByDisplayValue('Шаблон')
  fireEvent.changeText(
    screen.getByLabelText('Название шаблона'),
    'Без сохранения'
  )
  fireEvent.press(screen.getByTestId('proposal-preview'))
  await screen.findByTestId('preview')
  expect(mockPreview.mock.calls[0]).toEqual([
    't',
    expect.objectContaining({
      name: 'Без сохранения',
      blocks: template.blocks,
    }),
  ])
  expect(mockSave).not.toHaveBeenCalled()
})
it('back with unsaved changes prevents removal and asks before discard', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  const screen = draw()
  await screen.findByDisplayValue('Шаблон')
  fireEvent.changeText(screen.getByLabelText('Название шаблона'), 'Правки')
  const [blocked, listener] = mockPreventRemove.mock.calls.at(-1)!
  expect(blocked).toBe(true)
  await act(async () => listener({ data: { action: { type: 'GO_BACK' } } }))
  expect(spy).toHaveBeenCalled()
  expect(mockNavigation.dispatch).not.toHaveBeenCalled()
  spy.mockRestore()
})
it('catalogue failure does not enable an empty service picker', async () => {
  mockServices.mockRejectedValueOnce(Error('network'))
  const screen = draw()
  await screen.findByDisplayValue('Шаблон')
  await screen.findByText(
    'Каталог услуг не загрузился. Снимки позиций сохранены; повторите чтение каталога.'
  )
  expect(
    screen.getByTestId('proposal-catalog-main').props.accessibilityState
      .disabled
  ).toBe(true)
})

it('shows Russian block and media names instead of internal DTO values', async () => {
  mockGetTemplate.mockResolvedValueOnce({
    ...template,
    blocks: [
      { type: 'cover', title: 'КП', text: 'Подзаголовок' },
      ...template.blocks,
      { type: 'packages', title: 'Варианты' },
    ],
    media: [{ id: 'm', kind: 'image', url: 'https://example.invalid/a.png' }],
  })
  const screen = draw()
  await screen.findByDisplayValue('Шаблон')
  expect(screen.getByText('✓ Обложка · показывается')).toBeTruthy()
  expect(screen.getByText('✓ Вступление · показывается')).toBeTruthy()
  expect(screen.getByText('✓ Варианты · показывается')).toBeTruthy()
  expect(screen.getByText('Фото')).toBeTruthy()
  expect(screen.queryByText(/✓ (intro|cover|packages) ·/)).toBeNull()
})
