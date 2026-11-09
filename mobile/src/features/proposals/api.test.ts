let mockSessionSequence = 0
const mockCreationRows = new Map<string, any>()
let mockCleanupFails = false
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
jest.mock('../../shared/storage/cache', () => ({
  getCachedEntity: async (kind: string, id: string) => mockCreationRows.get(`${kind}:${id}`) || null,
  upsertEntities: async (kind: string, rows: any[]) => { for (const row of rows) mockCreationRows.set(`${kind}:${row._id}`, JSON.parse(JSON.stringify(row))) },
  removeCachedEntity: async (kind: string, id: string) => { if (mockCleanupFails) throw new Error('local disk unavailable'); mockCreationRows.delete(`${kind}:${id}`) },
}))
jest.mock('../../shared/storage/localEntityIds', () => ({ localEntityIdentity: async () => JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant']), assertLocalEntityIdentity: async (id: string) => { if (id !== JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant'])) throw new Error('SESSION_CHANGED') } }))
jest.mock('../../shared/storage/localEntityCoordination', () => ({ localDataEpoch: () => mockSessionSequence, assertLocalDataEpoch: (epoch: number) => { if (epoch !== mockSessionSequence) throw new Error('SESSION_CHANGED') }, withLocalEntityWrite: async (fn: () => unknown) => fn() }))
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
it('renews the same proposal with the fresh revision and only its expiry', async () => {
  const current = { ...proposal, status: 'expired', contentRevision: 12, selectedPackageId: 'option', publicUrl: 'https://vedelo.ru/p/link' }
  const fresh = { ...current, status: 'published', contentRevision: 13, validUntil: '2099-07-04T00:00:00.000Z' }
  mockRequest.mockResolvedValueOnce(data(current)).mockResolvedValueOnce(data(fresh)).mockResolvedValueOnce(data(fresh))
  await expect(api().renew('p', 'e', '2099-07-04')).resolves.toMatchObject(fresh)
  expect(mockRequest.mock.calls).toEqual([
    ['/proposals/p', undefined],
    ['/proposals/p', { method: 'PATCH', skipRefresh: true, body: { validUntil: '2099-07-04', contentRevision: 12 } }],
    ['/proposals/p', undefined],
  ])
})
it('will not shorten a newer PWA expiry or renew a mismatched work item', async () => {
  const current = { ...proposal, status: 'published', validUntil: '2099-07-05T00:00:00.000Z' }
  mockRequest.mockResolvedValueOnce(data(current)).mockResolvedValueOnce(data({ ...current, eventId: 'other' }))
  await expect(api().renew('p', 'e', '2099-07-04')).resolves.toMatchObject(current)
  await expect(api().renew('p', 'e', '2099-07-04')).rejects.toThrow('EVENT_MISMATCH')
  expect(mockRequest.mock.calls).toEqual([['/proposals/p', undefined], ['/proposals/p', undefined]])
})
it('process restart after a lost create response restores input and reuses the exact request ID', async () => {
  mockRequest.mockRejectedValueOnce(new Error('lost response'))
  await expect(api().create('e', { sourceProposalId: 'original' })).rejects.toThrow('lost response')
  const firstBody = mockRequest.mock.calls[0][1].body
  const { proposalOperations } = require('./operations')
  const identity = JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant'])
  proposalOperations.clear(identity, 'create-proposal', 'e') // Drop process memory, retain the encrypted rows.
  await expect(api().create('e', { templateId: 'different' })).rejects.toThrow('CREATE_OUTCOME_PENDING')
  expect(mockRequest).toHaveBeenCalledTimes(1)
  await api().restoreCreate('e')
  expect(proposalOperations.get(identity, 'create-proposal', 'e')).toMatchObject({ recoverable: true, phase: 'unknown' })
  mockRequest.mockResolvedValueOnce(data(proposal)).mockResolvedValueOnce(data(proposal))
  expect(await api().recoverCreate('e')).toMatchObject(proposal)
  expect(mockRequest.mock.calls[1]).toEqual(['/mobile/v1/events/e/proposals', { method: 'POST', skipRefresh: true, body: firstBody }])
  expect(mockRequest.mock.calls[2]).toEqual(['/proposals/p', undefined])
  expect(mockCreationRows.size).toBe(0)
})
it('a known create response survives restart and recovery performs only the exact GET', async () => {
  mockRequest.mockResolvedValueOnce(data(proposal)).mockRejectedValueOnce(new Error('read unavailable'))
  await expect(api().create('e', {})).rejects.toThrow('READBACK_FAILED')
  const { proposalOperations } = require('./operations')
  const identity = JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant'])
  proposalOperations.clear(identity, 'create-proposal', 'e')
  await api().restoreCreate('e')
  mockRequest.mockResolvedValueOnce(data(proposal))
  await api().recoverCreate('e')
  expect(mockRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(mockRequest.mock.calls[2]).toEqual(['/proposals/p', undefined])
})
it('a template confirmation restores its exact form after restart without another request', async () => {
  const { _id: _unused, ...input } = template
  mockRequest.mockRejectedValueOnce(new Error('offline'))
  await expect(api().saveTemplate(undefined, input)).rejects.toThrow('offline')
  const { proposalOperations } = require('./operations')
  proposalOperations.clear(JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant']), 'create-template', 'new')
  expect(await api().restoreTemplate()).toMatchObject({ ...input, _id: 'new' })
  expect(mockRequest).toHaveBeenCalledTimes(1)
  mockRequest.mockResolvedValueOnce(data(template)).mockResolvedValueOnce(data(template))
  expect(await api().recoverTemplate()).toMatchObject(template)
  expect(mockRequest.mock.calls[1][1].body).toEqual(mockRequest.mock.calls[0][1].body)
})
it('confirmed deletion closes a pending creation without another create or resurrecting its row', async () => {
  mockRequest.mockRejectedValueOnce(new Error('lost response'))
  await expect(api().create('e', {})).rejects.toThrow('lost response')
  mockRequest.mockRejectedValueOnce(Object.assign(new Error('Deleted'), { status: 410, code: 'created_resource_deleted' }))
  await expect(api().recoverCreate('e')).rejects.toThrow('CREATED_RESOURCE_GONE')
  expect(mockCreationRows.size).toBe(0)
  expect(mockRequest).toHaveBeenCalledTimes(2)
  const { proposalOperations } = require('./operations')
  expect(proposalOperations.get(JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant']), 'create-proposal', 'e')).toBeUndefined()
})
it('a local cleanup failure after server deletion remains recoverable instead of leaving creation busy', async () => {
  mockRequest.mockRejectedValueOnce(new Error('lost response'))
  await expect(api().create('e', {})).rejects.toThrow('lost response')
  const deleted = Object.assign(new Error('Deleted'), { status: 410, code: 'created_resource_deleted' })
  mockCleanupFails = true
  mockRequest.mockRejectedValueOnce(deleted)
  await expect(api().recoverCreate('e')).rejects.toThrow('local disk unavailable')
  const { proposalOperations } = require('./operations')
  const identity = JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant'])
  expect(proposalOperations.get(identity, 'create-proposal', 'e')).toMatchObject({ inflight: false, recoverable: true })
  expect(mockCreationRows.size).toBe(1)
  mockCleanupFails = false
  mockRequest.mockRejectedValueOnce(deleted)
  await expect(api().recoverCreate('e')).rejects.toThrow('CREATED_RESOURCE_GONE')
  expect(mockCreationRows.size).toBe(0)
  expect(proposalOperations.get(identity, 'create-proposal', 'e')).toBeUndefined()
  expect(mockRequest.mock.calls[2][1].body).toEqual(mockRequest.mock.calls[0][1].body)
})
it('an unstructured proxy 404 cannot discard a known creation; only exact API not_found can close it', async () => {
  mockRequest.mockResolvedValueOnce(data(proposal)).mockRejectedValueOnce(Object.assign(new Error('Proxy page missing'), { status: 404 }))
  await expect(api().create('e', {})).rejects.toThrow('READBACK_FAILED')
  expect(mockCreationRows.size).toBe(1)
  mockRequest.mockRejectedValueOnce(Object.assign(new Error('Proposal missing'), { status: 404, code: 'not_found' }))
  await expect(api().recoverCreate('e')).rejects.toThrow('CREATED_RESOURCE_GONE')
  expect(mockCreationRows.size).toBe(0)
  expect(mockRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})
it('lost cancellation survives restart and cannot resume the old creation', async () => {
  mockRequest.mockRejectedValueOnce(new Error('create reply lost'))
  await expect(api().create('e', { templateId: 'missing' })).rejects.toThrow('create reply lost')
  mockRequest.mockRejectedValueOnce(new Error('cancel reply lost'))
  await expect(api().cancelCreate('e')).rejects.toThrow('cancel reply lost')
  const { proposalOperations } = require('./operations')
  const identity = JSON.stringify([`test-user-${mockSessionSequence}`, 'test-tenant'])
  proposalOperations.clear(identity, 'create-proposal', 'e')
  await api().restoreCreate('e')
  expect(proposalOperations.get(identity, 'create-proposal', 'e')).toMatchObject({ inflight: false, cancelRequested: true })
  await expect(api().recoverCreate('e')).rejects.toThrow('CREATION_CANCELLATION_PENDING')
  expect(mockRequest).toHaveBeenCalledTimes(2)
  mockRequest.mockRejectedValueOnce(Object.assign(new Error('Cancelled'), { status: 410, code: 'creation_cancelled' }))
  await expect(api().cancelCreate('e')).rejects.toThrow('CREATION_CANCELLED')
  expect(mockCreationRows.size).toBe(0)
  expect(mockRequest.mock.calls.map(([path]) => path)).toEqual(['/mobile/v1/events/e/proposals', '/mobile/v1/events/e/proposals/cancel', '/mobile/v1/events/e/proposals/cancel'])
  expect(mockRequest.mock.calls[2][1].body).toEqual(mockRequest.mock.calls[0][1].body)
})
it('cancellation reads a creation that won the race without deleting or overwriting it', async () => {
  mockRequest.mockRejectedValueOnce(new Error('reply lost'))
  await expect(api().create('e', {})).rejects.toThrow('reply lost')
  mockRequest.mockResolvedValueOnce(data({ state: 'created', id: 'p' })).mockResolvedValueOnce(data({ ...proposal, title: 'Later PWA edit' }))
  expect(await api().cancelCreate('e')).toMatchObject({ _id: 'p', title: 'Later PWA edit' })
  expect(mockCreationRows.size).toBe(0)
  expect(mockRequest.mock.calls[2]).toEqual(['/proposals/p', undefined])
  expect(mockRequest.mock.calls.some(([, options]) => ['DELETE', 'PATCH'].includes(options?.method))).toBe(false)
})
it('template cancellation preserves the confirmed input until server acknowledgement', async () => {
  const { _id: _unused, ...input } = template
  mockRequest.mockRejectedValueOnce(new Error('offline'))
  await expect(api().saveTemplate(undefined, input)).rejects.toThrow('offline')
  mockRequest.mockResolvedValueOnce(data({ state: 'cancelled' }))
  expect(await api().cancelTemplate()).toBeNull()
  expect(mockRequest.mock.calls[1][0]).toBe('/mobile/v1/proposal-templates/cancel')
  expect(mockRequest.mock.calls[1][1].body).toEqual(mockRequest.mock.calls[0][1].body)
  expect(mockCreationRows.size).toBe(0)
})
beforeEach(() => {
  mockSessionSequence++
  mockCreationRows.clear()
  mockCleanupFails = false
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
      '/mobile/v1/events/e/proposals',
      { method: 'POST', skipRefresh: true, body: { sourceProposalId: 'original', requestId: '11111111-1111-4111-8111-111111111111' } },
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
    ['/mobile/v1/proposal-templates', { method: 'POST', skipRefresh: true, body: { name: 'Шаблон', requestId: '11111111-1111-4111-8111-111111111111' } }],
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
it('template conversion reads only the common server draft', async () => {
  mockRequest.mockResolvedValueOnce(data(template))
  const draft = await api().templateFromProposal('p')
  expect(draft.name).toBe('Шаблон')
  expect(draft._id).toBeUndefined()
  expect(mockRequest.mock.calls).toEqual([['/proposals/p?view=template-draft', undefined]])
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
it.each(['new', 't'])('template logo %s uses its tenant-protected endpoint without creating a template', async id => {
  mockUpload.mockResolvedValueOnce(data({ url: 'https://cloud.escalion.ru/uploads/vedelo/a/proposal-templates/t/logo.webp' }))
  mockRequest.mockResolvedValueOnce(data(template))
  await expect(api().uploadTemplateLogo(id, { uri: 'file:///logo.png', name: 'logo.png', mimeType: 'image/png', size: 20 })).resolves.toMatch(/logo.webp$/)
  expect(mockUpload.mock.calls[0][0]).toBe(`/proposal-templates/${id}/logo`)
  expect(mockRequest.mock.calls).toEqual(id === 'new' ? [] : [['/proposal-templates/t', undefined]])
})
it('gallery uploads match PWA type and size limits', async () => {
  const file = { uri: 'file:///movie.mp4', name: 'movie.mp4', mimeType: 'video/mp4', size: 50 * 1024 * 1024 }
  mockUpload.mockResolvedValueOnce(data({ path: 'uploads/vedelo/a/proposals/p/movie.mp4' }))
  await expect(api().uploadGallery('proposal', 'p', file)).resolves.toMatch(/movie.mp4$/)
  for (const bad of [{ ...file, size: file.size + 1 }, { ...file, mimeType: 'video/webm', size: 20 }, { ...file, mimeType: 'image/gif', size: 20 }])
    await expect(api().uploadGallery('proposal', 'p', bad)).rejects.toThrow('INVALID_MEDIA_FILE')
  expect(mockUpload).toHaveBeenCalledTimes(1)
})
it('rich-text uploads retain the separate PWA GIF/WebM contract', async () => {
  mockUpload.mockResolvedValue(data({ path: 'uploads/vedelo/a/proposals/p/file.webm' }))
  for (const mimeType of ['image/gif', 'video/webm'])
    await expect(api().uploadMedia('proposal', 'p', { uri: 'file:///file', name: 'file', mimeType, size: 20 })).resolves.toBeTruthy()
  await expect(api().uploadMedia('proposal', 'p', { uri: 'file:///file', name: 'file', mimeType: 'video/webm', size: 40 * 1024 * 1024 + 1 })).rejects.toThrow('INVALID_MEDIA_FILE')
})
it('native media validation is generated verbatim from the PWA contract', () => {
  const fs = require('node:fs'), path = require('node:path')
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../helpers/proposalMedia.mjs'), 'utf8')
  const generated = fs.readFileSync(path.resolve(__dirname, 'proposalMedia.generated.ts'), 'utf8')
  expect(generated.replace(/^\/\/ @ts-nocheck\r?\n\/\/ Generated verbatim from helpers\/proposalMedia.mjs\.\r?\n/, '').replaceAll('\r\n', '\n')).toBe(source.replaceAll('\r\n', '\n'))
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
