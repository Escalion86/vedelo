let mockSessionSequence = 0
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://stagej.invalid/api' } }))
jest.mock('../../shared/auth/tokenStore', () => ({ getStoredUser: async () => ({ _id: `test-user-${mockSessionSequence}`, tenantId: 'test-tenant' }), getAccessToken: async () => 'fixture-credential', subscribeAuthSession: () => () => {} }))
// Exercise the real React Native multipart implementation, not JSDOM FormData.
const originalFetch = global.fetch
const originalFormData = global.FormData
const NativeFormData =
  require('react-native/Libraries/Network/FormData').default
beforeAll(() => {
  global.FormData = NativeFormData
})
afterAll(() => {
  global.FormData = originalFormData
  global.fetch = originalFetch
})
const mockRequest = jest.fn()
const mockUpload = jest.fn()
jest.mock('../../shared/api/client', () => ({
  api: {
    request: (path: string, options: any) => mockRequest(path, options?.method ? { method: options.method, skipRefresh: options.skipRefresh, ...(options.body !== undefined ? { body: options.body } : {}) } : undefined),
    upload: (...args: unknown[]) => mockUpload(...args),
  },
}))
let subject: any = {}
try {
  subject = require('./api')
} catch (error) {
  if (
    !String((error as { message?: string })?.message).includes(
      "Cannot find module './api'"
    )
  )
    throw error
}
const proposal = {
  _id: 'p',
  eventId: 'e',
  title: 'КП',
  status: 'draft',
  version: 1,
  packages: [],
  blocksSnapshot: [],
  mediaSnapshot: [],
  messageText: '',
}
const template = {
  _id: 't',
  name: 'Шаблон',
  status: 'active',
  defaults: { packages: [], servicesIds: [] },
  blocks: [],
  media: [],
  messageTemplate: '',
}
const data = (value: unknown) => ({ success: true, data: value })
function api() {
  expect(subject.proposalsApi).toBeDefined()
  return subject.proposalsApi
}
beforeEach(() => {
  mockSessionSequence++
  mockRequest.mockReset()
  mockUpload.mockReset()
  global.fetch = jest.fn(async (url, options: any) => ({ ok: true, json: () => mockUpload(new URL(String(url)).pathname.replace(/^\/api/, ''), options.body) })) as any
})
it('create/clone POST exact event then GET exact created proposal', async () => {
  mockRequest
    .mockResolvedValueOnce(data(proposal))
    .mockResolvedValueOnce(data(proposal))
  expect(
    await api().create('e', { sourceProposalId: 'original' })
  ).toMatchObject(proposal)
  expect(mockRequest.mock.calls).toEqual([
    [
      '/events/e/proposals',
      { method: 'POST', skipRefresh: true, body: { sourceProposalId: 'original' } },
    ],
    ['/proposals/p', undefined],
  ])
})
it('save does PATCH, rereads exact ID and preserves rich media', async () => {
  const html =
    '<p>Текст</p><img src="https://cloud.escalion.ru/uploads/a.png"><video src="https://cloud.escalion.ru/uploads/a.mp4" controls></video>'
  const saved = {
    ...proposal,
    blocksSnapshot: [
      { id: 'intro', type: 'intro', title: 'Новый', contentHtml: html },
    ],
  }
  mockRequest
    .mockResolvedValueOnce(data(saved))
    .mockResolvedValueOnce(data(saved))
  expect(
    (await api().save('p', { title: 'Новое', blocks: saved.blocksSnapshot }))
      .blocksSnapshot[0].contentHtml
  ).toBe(html)
  expect(mockRequest.mock.calls[0]).toEqual([
    '/proposals/p',
    { method: 'PATCH', skipRefresh: true, body: { title: 'Новое', blocks: saved.blocksSnapshot } },
  ])
})
it('readback failure is failure, wrong object ID rejected', async () => {
  mockRequest
    .mockResolvedValueOnce(data(proposal))
    .mockResolvedValueOnce(data({ ...proposal, _id: 'foreign' }))
  await expect(api().save('p', { title: 'Правки' })).rejects.toThrow()
})
it.each(['publish', 'revoke', 'apply'])(
  'action %s uses PATCH and readback, apply rereads exact event',
  async (action) => {
    mockRequest
      .mockResolvedValueOnce(data(proposal))
      .mockResolvedValueOnce(data(proposal))
      .mockResolvedValueOnce(
        data({
          _id: 'e',
          status: 'active',
          contractSum: 500,
          servicesIds: ['s'],
          agreedProposal: { title: 'Снимок' },
        })
      )
    const result = await api().action(proposal, action)
    expect(mockRequest.mock.calls[0]).toEqual([
      '/proposals/p',
      { method: 'PATCH', skipRefresh: true, body: { action } },
    ])
    if (action === 'apply') {
      expect(mockRequest.mock.calls[2]).toEqual([
        '/mobile/v1/events/e',
        undefined,
      ])
      expect(result.event.contractSum).toBe(500)
    }
  }
)
it('selected revoke blocked before any request; selected DELETE checks exact list and event', async () => {
  const chosen = { ...proposal, selectedPackageId: 'main' }
  await expect(api().action(chosen, 'revoke')).rejects.toThrow()
  expect(mockRequest).not.toHaveBeenCalled()
  mockRequest
    .mockResolvedValueOnce(data({ id: 'p' }))
    .mockResolvedValueOnce(data([]))
    .mockResolvedValueOnce(
      data({
        _id: 'e',
        status: 'active',
        contractSum: 500,
        servicesIds: ['s'],
        agreedProposal: { packageId: 'main' },
      })
    )
  const result = await api().remove(chosen)
  expect(result.event.agreedProposal.packageId).toBe('main')
  expect(mockRequest.mock.calls[0]).toEqual([
    '/proposals/p',
    { method: 'DELETE', skipRefresh: true },
  ])
})
it('template create and update use real POST/PATCH, reread exact template', async () => {
  mockRequest
    .mockResolvedValueOnce(data(template))
    .mockResolvedValueOnce(data(template))
    .mockResolvedValueOnce(data(template))
    .mockResolvedValueOnce(data(template))
  await api().saveTemplate(undefined, { name: 'Шаблон' })
  await api().saveTemplate('t', { name: 'Шаблон' })
  expect(mockRequest.mock.calls).toEqual([
    ['/proposal-templates', { method: 'POST', skipRefresh: true, body: { name: 'Шаблон' } }],
    ['/proposal-templates/t', undefined],
    ['/proposal-templates/t', { method: 'PATCH', skipRefresh: true, body: { name: 'Шаблон' } }],
    ['/proposal-templates/t', undefined],
  ])
})
it('Telegram partial delivery remains visible and does readback', async () => {
  mockRequest
    .mockResolvedValueOnce({
      success: false,
      error: { code: 'partial_delivery', message: 'Частично' },
      data: { delivery: [{ status: 'failed' }] },
    })
    .mockResolvedValueOnce(data(proposal))
  const result = await api().sendTelegram('p', true)
  expect(result.partial).toBe(true)
  expect(mockRequest.mock.calls[0]).toEqual([
    '/proposals/p/send-telegram',
    { method: 'POST', skipRefresh: true, body: { retryFailedOnly: true } },
  ])
})
it('malformed or success:false responses never become successful empty lists', async () => {
  mockRequest.mockResolvedValueOnce({ success: false, data: [] })
  await expect(api().list('e')).rejects.toThrow()
  mockRequest.mockResolvedValueOnce(data([{}]))
  await expect(api().templates()).rejects.toThrow()
})
it('preview uses private POST with unsaved data; defaults and services use tenant GET', async () => {
  mockRequest
    .mockResolvedValueOnce(
      data({ title: 'Несохранённое', blocks: [], media: [], packages: [] })
    )
    .mockResolvedValueOnce(
      data({
        blocks: [],
        media: [],
        defaults: { packages: [], servicesIds: [] },
        messageTemplate: '',
      })
    )
    .mockResolvedValueOnce(data([{ _id: 's', title: 'Услуга', price: 20 }]))
  await api().previewTemplate('t', { name: 'Несохранённое' })
  await api().templateDefaults()
  expect((await api().services())[0].title).toBe('Услуга')
  expect(mockRequest.mock.calls[0]).toEqual([
    '/proposal-templates/t/preview',
    { method: 'POST', skipRefresh: true, body: { name: 'Несохранённое' } },
  ])
})
it('template DELETE used archive is confirmed by exact reread and list', async () => {
  mockRequest
    .mockResolvedValueOnce({
      success: true,
      archived: true,
      data: { ...template, status: 'archived' },
    })
    .mockResolvedValueOnce(data({ ...template, status: 'archived' }))
    .mockResolvedValueOnce(data([{ ...template, status: 'archived' }]))
  const result = await api().removeTemplate('t')
  expect(result.archived).toBe(true)
  expect(mockRequest.mock.calls[0]).toEqual([
    '/proposal-templates/t',
    { method: 'DELETE', skipRefresh: true },
  ])
})
it('media uses cloud files/directory protocol and existing URL resolver', async () => {
  mockUpload.mockResolvedValueOnce({
    success: true,
    data: { path: 'uploads/artistcrm/a/proposals/p/photo.png' },
  })
  const file = {
    uri: 'file:///photo.png',
    name: 'photo.png',
    mimeType: 'image/png',
    size: 100,
  }
  expect(await api().uploadMedia('proposal', 'p', file)).toBe(
    'https://cloud.escalion.ru/uploads/artistcrm/a/proposals/p/photo.png'
  )
  expect(mockUpload.mock.calls[0][0]).toBe('/escalioncloud')
  expect(
    mockUpload.mock.calls[0][1]
      .getParts()
      .find((part: any) => part.fieldName === 'directory').string
  ).toBe('proposals/p')
  await expect(
    api().uploadMedia('proposal', 'p', { ...file, mimeType: 'text/html' })
  ).rejects.toThrow()
  expect(mockUpload).toHaveBeenCalledTimes(1)
})

it('logo uses dedicated POST file endpoint with native upload and exact proposal readback', async () => {
  mockUpload.mockResolvedValueOnce(
    data({
      url: 'https://cloud.escalion.ru/uploads/vedelo/a/proposals/p/logo.webp',
    })
  )
  mockRequest.mockResolvedValueOnce(data(proposal))
  expect(
    await api().uploadLogo('p', {
      uri: 'file:///logo.png',
      name: 'logo.png',
      mimeType: 'image/png',
      size: 20,
    })
  ).toMatch(/logo.webp$/)
  expect(mockUpload.mock.calls[0][0]).toBe('/proposals/p/logo')
  expect(mockRequest.mock.calls[0][0]).toBe('/proposals/p')
})
it('PATCH readback must match the exact server mutation snapshot', async () => {
  mockRequest
    .mockResolvedValueOnce(data({ ...proposal, title: 'Сохранено' }))
    .mockResolvedValueOnce(data({ ...proposal, title: 'Старое' }))
  await expect(api().save('p', { title: 'Сохранено' })).rejects.toThrow()
})
it('readEvent uses exact protected mobile event route and rejects a different ID', async () => {
  mockRequest
    .mockResolvedValueOnce(
      data({ _id: 'e', status: 'closed', agreedProposal: null })
    )
    .mockResolvedValueOnce(data({ _id: 'other', status: 'active' }))
  expect((await api().readEvent('e')).status).toBe('closed')
  expect(mockRequest.mock.calls[0]).toEqual(['/mobile/v1/events/e', undefined])
  await expect(api().readEvent('e')).rejects.toThrow()
})
it.each(['changed', 'different-id'])(
  'action mutation readback rejects %s snapshot',
  async (mode) => {
    mockRequest
      .mockResolvedValueOnce(
        data({
          ...proposal,
          _id: mode === 'different-id' ? 'other' : 'p',
          status: 'published',
        })
      )
      .mockResolvedValueOnce(data({ ...proposal, status: 'revoked' }))
    await expect(api().action(proposal, 'publish')).rejects.toThrow()
  }
)
it('legacy archived template mutation is verified by materialized exact GET', async () => {
  mockRequest
    .mockResolvedValueOnce({
      success: true,
      archived: true,
      data: {
        ...template,
        status: 'archived',
        defaults: { servicesIds: ['s'] },
      },
    })
    .mockResolvedValueOnce(data({ ...template, status: 'archived' }))
    .mockResolvedValueOnce(data([{ ...template, status: 'archived' }]))
  await expect(api().removeTemplate('t')).resolves.toMatchObject({
    archived: true,
  })
  expect(mockRequest.mock.calls[1]).toEqual([
    '/proposal-templates/t',
    undefined,
  ])
})
