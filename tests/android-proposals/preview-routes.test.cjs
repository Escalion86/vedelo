const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
test.before(() => loadBindings())
const paths = [
  'app/api/proposals/[id]/preview/route.js',
  'app/api/proposal-templates/[id]/preview/route.js',
  'app/api/proposal-templates/defaults/route.js',
]
function load(file, tenant = 'a', allowed = true) {
  assert.ok(fs.existsSync(file), 'Приватный preview/defaults route отсутствует')
  const filters = [],
    writes = []
  const stored = {
    _id: 'p',
    tenantId: 'a',
    eventId: 'e',
    title: 'Сохранено',
    defaults: { packages: [] },
    blocks: [],
    media: [],
  }
  const query = (value) => ({
    lean: async () => value,
    sort() {
      return this
    },
  })
  const model = {
    findOne: (f) => {
      filters.push(f)
      return query(f.tenantId === 'a' ? stored : null)
    },
    find: (f) => {
      filters.push(f)
      return query([])
    },
    create: () => writes.push('create'),
    updateOne: () => writes.push('update'),
  }
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, options = {}) => ({ body, status: options.status || 200 }),
      },
    },
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    '@server/proposalRequestContext': require('../server/stageFLoader.cjs').loader({
      '@server/getRequestContext': async (r) =>
        r.headers.get('authorization') === 'Bearer valid'
          ? { tenantId: tenant, user: { _id: 'u' } }
          : {},
    })('server/proposalRequestContext.js'),
    '@server/getUserTariffAccess': async () => ({ allowProposals: allowed, user: { _id: 'u', tenantId: tenant } }),
    '@helpers/proposalAccess': {
      canUseProposalBuilder: (a) => a.allowProposals,
      PROPOSAL_BUILDER_ACCESS_ERROR: 'tariff',
    },
    '@server/dbConnect': async () => {},
    '@server/proposalPreview.mjs': {
      buildProposalPreview: (p, i = {}) => ({
        title: i.title || p.title,
        blocks: i.blocks || [],
        packages: i.packages || [],
        media: i.media || [],
      }),
    },
    '@server/proposals': {
      buildProposalSnapshot: ({ input }) => ({
        blocksSnapshot: input.blocks || [],
        packages: input.packages || [],
        mediaSnapshot: input.media || [],
      }),
    },
    '@helpers/proposalContent': {
      normalizeProposalPackages: (v) => (Array.isArray(v) ? v : []),
      normalizeProposalBlocks: () => [{ type: 'intro', enabled: true }],
      materializeProposalTemplateDefaults: () => ({
        packages: [],
        servicesIds: [],
      }),
      DEFAULT_PROPOSAL_MESSAGE: 'Сообщение',
    },
  }
  for (const name of ['Proposals', 'ProposalTemplates', 'Events', 'Services'])
    mocks['@models/' + name] = model
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const m = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (n) => {
      if (!(n in mocks)) throw Error(n)
      return mocks[n]
    },
    m,
    m.exports
  )
  return { route: m.exports, filters, writes }
}
for (const file of paths)
  for (const boundary of ['valid', 'invalid', 'tenant', 'tariff'])
    test(`${file}: ${boundary}`, async () => {
      const f = load(
        file,
        boundary === 'tenant' ? 'foreign' : 'a',
        boundary !== 'tariff'
      )
      const req = {
        headers: {
          get: () =>
            boundary === 'invalid' ? 'Bearer invalid' : 'Bearer valid',
        },
        json: async () => ({
          title: 'Несохранённое',
          name: 'Несохранённое',
          blocks: [{ type: 'intro' }],
        }),
      }
      const method = file.includes('defaults') ? 'GET' : 'POST'
      const result = await f.route[method](req, {
        params: Promise.resolve({ id: 'p' }),
      })
      assert.equal(
        result.status,
        boundary === 'invalid'
          ? 401
          : boundary === 'tariff'
            ? 403
            : boundary === 'tenant' && !file.includes('defaults')
              ? 404
              : 200
      )
      assert.deepEqual(f.writes, [])
      assert.ok(
        f.filters.every(
          (f) => f.tenantId === (boundary === 'tenant' ? 'foreign' : 'a')
        )
      )
      if (boundary === 'valid' && method === 'POST')
        assert.equal(result.body.data.title, 'Несохранённое')
    })
