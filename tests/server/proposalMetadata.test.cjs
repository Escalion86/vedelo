const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { loadBindings } = require('next/dist/build/swc')
const { loader } = require('./stageFLoader.cjs')

test.before(() => loadBindings())
const tenant = 'a'.repeat(24)
const publicId = 'p'.repeat(22)
const token = 's'.repeat(43)
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const logo = `https://cloud.escalion.ru/uploads/vedelo/${tenant}/proposals/${'b'.repeat(24)}/logos/cccccccc-cccc-cccc-cccc-cccccccccccc/logo.webp`
function fixture(overrides = {}) {
  const record = {
    publicId, publicTokenHash: hash(token), tenantId: tenant, status: 'published',
    artistSnapshot: { fullName: '  Иван   Иванов  ', phone: 'private-phone' },
    appearance: { logoUrl: logo }, clientSnapshot: { firstName: 'private-client' },
    packages: [{ total: 987654 }], ...overrides,
  }
  const filters = []
  const api = loader({
    '@server/dbConnect': async () => {},
    '@models/Proposals': { findOne(filter) {
      filters.push(filter)
      const matches = record.publicId === filter.publicId &&
        record.publicTokenHash === filter.publicTokenHash && record.tenantId &&
        record.status === filter.status &&
        (!record.validUntil || record.validUntil >= filter.$or[1].validUntil.$gte)
      return { select(fields) {
        assert.equal(fields, 'tenantId artistSnapshot.fullName appearance')
        return { lean: async () => matches ? record : null }
      } }
    } },
  })('server/proposalMetadata.js')
  return { ...api, filters, record }
}

test('personal title, description and tenant logo without client/financial data', async () => {
  const f = fixture()
  const metadata = await f.getProposalMetadata(publicId, token)
  assert.equal(metadata.openGraph.title, 'Персональное предложение от Иван Иванов')
  assert.equal(metadata.openGraph.images[0].url, logo)
  assert.deepEqual(metadata.twitter.images, [logo])
  assert.equal(metadata.referrer, 'no-referrer')
  assert.equal(metadata.robots.index, false)
  assert.doesNotMatch(JSON.stringify(metadata), /CRM|private-client|private-phone|987654|publicToken/)
  assert.equal(f.filters[0].publicTokenHash, hash(token))
  assert.deepEqual(f.filters[0].tenantId, { $ne: null })
})

for (const [name, changes, inputToken] of [
  ['wrong token', {}, 'z'.repeat(43)],
  ['another tenant token', { tenantId: 'd'.repeat(24), publicTokenHash: hash('foreign') }, token],
  ['draft', { status: 'draft' }, token],
  ['revoked', { status: 'revoked' }, token],
  ['expired status', { status: 'expired' }, token],
  ['expired date', { validUntil: new Date(0) }, token],
  ['missing tenant', { tenantId: null }, token],
]) test(`${name}: neutral metadata`, async () => {
  const f = fixture(changes)
  assert.deepEqual(await f.getProposalMetadata(publicId, inputToken), f.buildProposalMetadata())
})

test('malformed credentials do not query database; foreign logo is rejected', async () => {
  const f = fixture()
  await f.getProposalMetadata({ $ne: null }, token)
  await f.getProposalMetadata(publicId, 'bad')
  assert.equal(f.filters.length, 0)
  const metadata = f.buildProposalMetadata({ ...f.record, tenantId: 'd'.repeat(24) })
  assert.match(metadata.openGraph.images[0].url, /icons\/vedelo-v1/)
})

test('Next resolves proposal metadata over root marketing images and description', async () => {
  // Next aliases this marker to an empty module in its server compilation.
  const Module = require('node:module')
  const originalLoad = Module._load
  let accumulateMetadata
  try {
    Module._load = function (name, ...args) {
      if (name === 'server-only') return {}
      return originalLoad.call(this, name, ...args)
    }
    ;({ accumulateMetadata } = require('next/dist/lib/metadata/resolve-metadata'))
  } finally {
    Module._load = originalLoad
  }
  const metadata = fixture().buildProposalMetadata(fixture().record)
  const root = { description: 'CRM marketing', metadataBase: new URL('https://vedelo.ru') }
  const staticImages = { openGraph: [{ url: '/opengraph-image' }], twitter: [{ url: '/twitter-image' }] }
  const result = await accumulateMetadata('/proposal/[publicId]/[token]', [
    [root, staticImages, null], [metadata, null, null],
  ], '/proposal/example/secret', { trailingSlash: false, isStaticMetadataRouteFile: false })
  assert.equal(result.openGraph.images[0].url.toString(), logo)
  assert.equal(result.twitter.images[0].url.toString(), logo)
  assert.equal(result.description, metadata.description)
  assert.equal(result.title.absolute, metadata.title.absolute)
})

test('preview bots receive blocking head metadata, default bots remain supported', () => {
  const { htmlLimitedBots } = require('../../next.config.js')
  for (const ua of ['MAX/1.0', 'MaxBot', 'OneMe', 'TelegramBot', 'Twitterbot', 'facebookexternalhit'])
    assert.ok(htmlLimitedBots.test(ua), ua)
})
