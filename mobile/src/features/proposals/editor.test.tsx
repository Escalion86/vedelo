jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'test-user', tenantId: 'test-tenant' } }) }))
import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
const mockSave = jest.fn()
const mockGetTemplate = jest.fn()
const mockPreview = jest.fn()
const mockServices = jest.fn()
const mockTemplateDraft = jest.fn()
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
      get: (...a: any[]) => mockGetTemplate(...a.slice(0, 1)),
      save: (...a: any[]) => mockSave(...a.slice(0, 2)),
      restoreTemplate: async () => null,
      template: (...a: any[]) => mockGetTemplate(...a.slice(0, 1)),
      saveTemplate: (...a: any[]) => mockSave(...a.slice(0, 2)),
      previewTemplate: (...a: any[]) => mockPreview(...a.slice(0, 2)),
      services: () => mockServices(),
      templateFromProposal: (...args: any[]) => mockTemplateDraft(...args),
    },
  })
)
jest.mock(
  './RichTextEditor',
  () => ({
    RichTextEditor: ({ value, onChange, block, disabled }: any) =>
      require('react').createElement(require('react-native').TextInput, {
        testID: `rich-${block.type}`,
        editable: !disabled,
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
it.each(['light', 'dark'] as const)('accepted proposal allows editing contacts but keeps packages locked (%s)', async (mode) => {
  const proposal = {
    _id: 'p', title: 'Принятое КП', status: 'published', contentRevision: 2,
    appliedAt: '2026-11-02T00:00:00Z', selectedPackageId: 'main',
    appliedPackageId: 'main', packages: template.defaults.packages,
    blocksSnapshot: template.blocks, mediaSnapshot: [],
  }
  mockGetTemplate.mockResolvedValue(proposal)
  mockSave.mockResolvedValue(proposal)
  const Editor = subject.ProposalEditorScreen
  const screen = render(<ThemeProvider storage={null} forcedMode={mode}><Editor kind="proposal" id="p" /></ThemeProvider>)
  const field = await screen.findByTestId('rich-intro')
  expect(field.props.editable).toBe(true)
  expect(screen.getByTestId('proposal-add-package')).toBeDisabled()
  expect(screen.getByTestId('proposal-remove-package-main')).toBeDisabled()
  fireEvent.changeText(field, '<p>Новые условия и контакты</p>')
  fireEvent.press(screen.getByTestId('proposal-save'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(JSON.stringify(mockSave.mock.calls[0][1])).toContain('Новые условия и контакты')
  expect(screen.getByText(/Варианты программ зафиксированы/)).toBeTruthy()
})
it.each(['light', 'dark'] as const)(
  'title edit %s only patches the title, preserving PWA snapshots',
  async (mode) => {
    const screen = draw(mode)
    await screen.findByDisplayValue('Шаблон')
    fireEvent.changeText(screen.getByLabelText('Название шаблона'), 'Новое имя')
    fireEvent.press(screen.getByTestId('proposal-save'))
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(mockSave.mock.calls[0][0]).toBe('t')
    expect(mockSave.mock.calls[0][1]).toEqual({ name: 'Новое имя' })
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

const modernBlocks = [
  ...template.blocks,
  { id: 'header', type: 'header', contentHtml: '<h2>Шапка PWA</h2>', enabled: true, future: { keep: true } },
  { id: 'packagesIntro', type: 'packagesIntro', contentHtml: '<p>Описание PWA</p>', enabled: true },
  { id: 'packages', type: 'packages', title: 'Варианты', enabled: true },
  { id: 'closing', type: 'closing', contentHtml: '<p>Условия PWA</p>', enabled: true },
]
it.each(['light', 'dark'] as const)('modern sections %s retain hidden HTML and only add an optional section on action', async mode => {
  mockGetTemplate.mockResolvedValueOnce({ ...template, blocks: modernBlocks })
  const s = draw(mode)
  await s.findByDisplayValue('Шаблон')
  expect(s.queryByTestId('rich-intro')).toBeNull()
  expect(s.queryByTestId('rich-packagesOutro')).toBeNull()
  expect(s.queryByText('Выше')).toBeNull()
  fireEvent.press(s.getByText('✓ Описание под шапкой · показывается'))
  expect(s.queryByTestId('rich-packagesIntro')).toBeNull()
  fireEvent.press(s.getByText('○ Описание под шапкой · скрыт'))
  expect(s.getByTestId('rich-packagesIntro').props.value).toBe('<p>Описание PWA</p>')
  fireEvent.press(s.getByText('✓ Варианты · показывается'))
  expect(s.queryByTestId('proposal-catalog-main')).toBeNull()
  fireEvent.press(s.getByText('○ Варианты · скрыт'))
  expect(s.getByTestId('proposal-catalog-main')).toBeTruthy()
  fireEvent.press(s.getByText('○ Описание после вариантов · скрыт'))
  fireEvent.changeText(s.getByTestId('rich-packagesOutro'), '<p>Новый раздел</p>')
  fireEvent.changeText(s.getByTestId('rich-header'), '<h2>Новая шапка</h2>')
  fireEvent.press(s.getByTestId('proposal-save'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  const payload = mockSave.mock.calls[0][1]
  expect(Object.keys(payload)).toEqual(['blocks'])
  expect(payload.blocks.find((b: any) => b.type === 'header')).toMatchObject({ contentHtml: '<h2>Новая шапка</h2>', future: { keep: true } })
  expect(payload.blocks.find((b: any) => b.type === 'packagesOutro')).toMatchObject({ enabled: true, contentHtml: '<p>Новый раздел</p>' })
  expect(payload.blocks.find((b: any) => b.type === 'intro')).toEqual(template.blocks[0])
  expect(payload.blocks.find((b: any) => b.type === 'closing')).toEqual(modernBlocks[4])
})
it('opening modern sections and saving a title does not materialize missing packagesOutro', async () => {
  mockGetTemplate.mockResolvedValueOnce({ ...template, blocks: modernBlocks })
  const s = draw()
  await s.findByDisplayValue('Шаблон')
  fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Только название')
  fireEvent.press(s.getByTestId('proposal-save'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][1]).toEqual({ name: 'Только название' })
})
it('proposal conversion opens a local template draft and only saves on explicit confirmation', async () => {
  mockTemplateDraft.mockResolvedValue({ ...template, name: 'Из КП', blocks: modernBlocks })
  const s = render(<ThemeProvider storage={null} forcedMode="light"><subject.ProposalEditorScreen kind="template" id="new" sourceProposalId="proposal" /></ThemeProvider>)
  await s.findByDisplayValue('Из КП')
  expect(mockTemplateDraft).toHaveBeenCalledWith('proposal', expect.objectContaining({ expectedIdentity: expect.any(String) }))
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.changeText(s.getByLabelText('Название шаблона'), 'Мой шаблон')
  fireEvent.press(s.getByTestId('proposal-save'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  expect(mockSave.mock.calls[0][0]).toBeUndefined()
  expect(mockSave.mock.calls[0][1]).toMatchObject({ name: 'Мой шаблон', status: 'active', blocks: modernBlocks, defaults: template.defaults })
})
it('media link validation, reordering and template appearance keep original media metadata', async () => {
  const media = [{ ...template.media[0], title: 'Фото', future: 'keep' }, { id: 'v', kind: 'video_link', url: 'https://vimeo.com/12345', title: 'Ролик' }]
  mockGetTemplate.mockResolvedValueOnce({ ...template, media })
  const s = draw()
  await s.findByDisplayValue('Шаблон')
  fireEvent.changeText(s.getByLabelText('Ссылка на видео'), 'https://vimeo.com.evil.invalid/123')
  fireEvent.press(s.getByText('Добавить видео-ссылку'))
  await s.findByText('Укажите корректную http(s)-ссылку на VK Video, Rutube, YouTube или Vimeo')
  expect(mockSave).not.toHaveBeenCalled()
  fireEvent.changeText(s.getByLabelText('Ссылка на видео'), 'https://vimeo.com/56789')
  fireEvent.press(s.getByText('Добавить видео-ссылку'))
  fireEvent.press(s.getByText('Выше: Ролик'))
  fireEvent.press(s.getByText('Тёмное'))
  fireEvent.press(s.getByTestId('proposal-save'))
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  const payload = mockSave.mock.calls[0][1]
  expect(payload.media.slice(0, 2)).toEqual([media[1], media[0]])
  expect(payload.media[2]).toMatchObject({ kind: 'video_link', url: 'https://vimeo.com/56789' })
  expect(payload.appearance).toMatchObject({ theme: 'dark' })
  expect(payload.blocks).toBeUndefined()
})
