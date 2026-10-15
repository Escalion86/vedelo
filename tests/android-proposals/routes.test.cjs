const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const routes = [
  ['app/api/events/[id]/proposals/route.js', ['GET', 'POST']],
  ['app/api/proposals/[id]/route.js', ['GET', 'PATCH', 'DELETE']],
  ['app/api/proposal-templates/route.js', ['GET', 'POST']],
  ['app/api/proposal-templates/[id]/route.js', ['GET', 'PATCH', 'DELETE']],
  ['app/api/proposals/[id]/send-telegram/route.js', ['POST']],
  ['app/api/proposals/[id]/logo/route.js', ['POST']],
  ['app/api/proposals/statuses/route.js', ['GET']],
]
test.before(() => loadBindings())
function fixture(file, bearer = true, tenant = 'a') {
  const filters = []
  const stored = {
    _id: 'p',
    tenantId: 'a',
    eventId: 'e',
    status: 'draft',
    title: 'КП',
    packages: [],
    blocksSnapshot: [],
    mediaSnapshot: [],
    toJSON() {
      return { ...this }
    },
    save: async () => {},
  }
  const query = (value) => ({
    sort() {
      return this
    },
    select() {
      return this
    },
    lean: async () => value,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  })
  const model = {
    findOne: (filter) => {
      filters.push(filter)
      return query(filter.tenantId === 'a' ? stored : null)
    },
    find: (filter) => {
      filters.push(filter)
      return query([])
    },
    exists: async () => false,
    create: async (value) => ({ ...value, _id: 'p' }),
    updateMany: async (filter) => {
      filters.push(filter)
    },
    findOneAndDelete: async (filter) => {
      filters.push(filter)
      return filter.tenantId === 'a' ? stored : null
    },
    findOneAndUpdate: async (filter) => {
      filters.push(filter)
      return null
    },
  }
  const context = async (req) =>
    req?.headers?.get('authorization') === 'Bearer valid'
      ? { tenantId: tenant, user: { _id: 'u' } }
      : { tenantId: null, user: null }
  const mocks = {
    'node:crypto': require('node:crypto'),
    'node:util': require('node:util'),
    'next/server': {
      NextResponse: {
        json: (body, opts = {}) => ({ body, status: opts.status || 200 }),
      },
    },
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    sharp: () => {},
    '@server/getTenantContext': async () =>
      bearer
        ? { tenantId: null, user: null }
        : { tenantId: 'a', user: { _id: 'u' } },
    '@server/proposalRequestContext': require('../server/stageFLoader.cjs').loader({
      '@server/getRequestContext': async (req) =>
        bearer ? context(req) : { tenantId: tenant, user: { _id: 'u' } },
    })('server/proposalRequestContext.js'),
    '@server/getRequestContext': async (req) =>
      bearer ? context(req) : { tenantId: tenant, user: { _id: 'u' } },
    '@server/getUserTariffAccess': async () => ({
      allowProposals: true,
      user: { _id: 'u', tenantId: tenant },
      allowTelegramIntegration: true,
    }),
    '@server/dbConnect': async () => {},
    '@helpers/proposalAccess': {
      canUseProposalBuilder: (access) => access.allowProposals,
      PROPOSAL_BUILDER_ACCESS_ERROR: 'tariff',
    },
    '@helpers/proposalAppearance.mjs': {
      normalizeProposalAppearance: () => ({ theme: 'classic', logoUrl: '' }),
      isProposalTheme: () => true,
    },
    '@helpers/proposalWorkflow': { buildAgreedProposal: () => ({}) },
    '@helpers/proposalContent': {
      normalizeProposalBlocks: (v) => v || [],
      normalizeProposalMedia: (v) => v || [],
      normalizeProposalPackages: (v) => v || [],
      normalizeProposalTemplateDefaults: () => ({ servicesIds: [] }),
      materializeProposalTemplateDefaults: (v) => v,
      getProposalUnknownVariables: () => [],
    },
    '@server/proposals': {
      buildProposalSnapshot: () => ({
        blocksSnapshot: [],
        packages: [],
        mediaSnapshot: [],
      }),
    },
    '@helpers/proposalStatus.mjs': { summarizeProposalStatuses: () => ({}) },
    '@server/telegramBusiness': {},
    '@server/escalionCloud': {},
  }
  for (const name of [
    'Events',
    'Clients',
    'Services',
    'ProposalTemplates',
    'Proposals',
    'TelegramConversations',
    'SiteSettings',
  ])
    mocks[`@models/${name}`] = model
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (!(name in mocks)) throw Error(name)
      return mocks[name]
    },
    mod,
    mod.exports
  )
  return { route: mod.exports, filters, stored }
}
const request = (authorization = 'Bearer valid', body = {}) => ({
  headers: { get: () => authorization },
  json: async () => body,
  formData: async () => new FormData(),
  nextUrl: { origin: 'https://example.invalid' },
})
const params = { params: Promise.resolve({ id: 'e' }) }
for (const [file, methods] of routes) {
  for (const method of methods) {
    test(`${file} ${method}: valid bearer reaches tenant domain logic`, async () => {
      const f = fixture(file)
      const response = await f.route[method](request(), params)
      assert.notEqual(response.status, 401)
      assert.ok(f.filters.every((filter) => filter.tenantId === 'a'))
    })
    test(`${file} ${method}: invalid bearer fails before tenant data`, async () => {
      const f = fixture(file)
      const response = await f.route[method](request('Bearer invalid'), params)
      assert.equal(response.status, 401)
      assert.equal(f.filters.length, 0)
    })
  }
}
test('DELETE выбранного КП не меняет сохранённый заказ', async () => {
  const f = fixture('app/api/proposals/[id]/route.js', false)
  f.stored.selectedPackageId = 'main'
  f.stored.appliedAt = '2026-10-01'
  const result = await f.route.DELETE(request(), params)
  assert.equal(result.status, 200)
  assert.deepEqual(f.filters.at(-1), { _id: 'e', tenantId: 'a' })
})

for (const file of [
  'app/api/events/[id]/proposals/route.js',
  'app/api/proposals/[id]/route.js',
  'app/api/proposal-templates/[id]/route.js',
])
  test(`${file}: чужой tenant получает 404 по точному ID`, async () => {
    const f = fixture(file, true, 'foreign')
    const response = await f.route.GET(request(), params)
    assert.equal(response.status, 404)
    assert.ok(f.filters.length > 0)
    assert.ok(f.filters.every((filter) => filter.tenantId === 'foreign'))
  })
test('template POST ignores tenant/owner from payload', async () => {
  const f = fixture('app/api/proposal-templates/route.js')
  const response = await f.route.POST(
    request('Bearer valid', {
      name: 'Шаблон',
      tenantId: 'forged',
      ownerId: 'forged',
    })
  )
  assert.equal(response.status, 201)
  assert.equal(response.body.data.tenantId, 'a')
  assert.equal(response.body.data.ownerId, undefined)
})
test('draft PATCH clearing validUntil keeps no expiry instead of epoch', async () => {
  const f = fixture('app/api/proposals/[id]/route.js', false)
  f.stored.validUntil = new Date('2026-12-01')
  const r = await f.route.PATCH(
    request('Bearer valid', { validUntil: null }),
    params
  )
  assert.equal(r.status, 200)
  assert.equal(r.body.data.validUntil, null)
})
test('draft edit is rejected for published immutable snapshot', async () => {
  const f = fixture('app/api/proposals/[id]/route.js', false)
  f.stored.status = 'published'
  assert.equal(
    (
      await f.route.PATCH(
        request('Bearer valid', { title: 'Не менять' }),
        params
      )
    ).status,
    409
  )
  assert.equal(f.stored.title, 'КП')
})
test('revoke selected proposal is rejected by real PATCH method', async () => {
  const f = fixture('app/api/proposals/[id]/route.js', false)
  f.stored.status = 'published'
  f.stored.selectedPackageId = 'main'
  assert.equal(
    (await f.route.PATCH(request('Bearer valid', { action: 'revoke' }), params))
      .status,
    409
  )
})

for (const [file, method] of [
  ['app/api/events/[id]/proposals/route.js', 'POST'],
  ['app/api/proposals/[id]/route.js', 'PATCH'],
  ['app/api/proposals/[id]/route.js', 'DELETE'],
  ['app/api/proposal-templates/[id]/route.js', 'PATCH'],
  ['app/api/proposal-templates/[id]/route.js', 'DELETE'],
  ['app/api/proposals/[id]/logo/route.js', 'POST'],
])
  test(`${file} ${method}: foreign tenant cannot mutate`, async () => {
    const f = fixture(file, true, 'foreign')
    const req = request()
    req.formData = async () => {
      const form = new FormData()
      form.append(
        'file',
        new File(['synthetic'], 'logo.png', { type: 'image/png' })
      )
      return form
    }
    const response = await f.route[method](req, params)
    assert.equal(response.status, 404)
    assert.ok(f.filters.every((filter) => filter.tenantId === 'foreign'))
  })
