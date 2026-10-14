const assert = require('node:assert/strict')
const { loader, chain } = require('../server/stageFLoader.cjs')
const { loadBindings } = require('next/dist/build/swc')
const A = 'a'.repeat(24), B = 'b'.repeat(24), ID = 'c'.repeat(24), TARIFF = 'd'.repeat(24)

async function initialize() { await loadBindings() }
function fixture(t, { foreign = false, allow = true } = {}) {
  const calls = { network: [], queries: [], cookie: 0 }
  const user = { _id: A, tenantId: A, role: 'user', tariffId: TARIFF }
  const record = { _id: ID, tenantId: A, eventId: ID, status: 'draft' }
  const matches = filter => {
    calls.queries.push(filter)
    assert.equal(filter.tenantId, A, 'real route includes authenticated tenant in owner queries')
    return foreign ? null : record
  }
  const load = loader({
    // Only DB and cookie boundaries. Auth/context, tariff rules, real sharp,
    // validator, POST, NextResponse and cloud adapter are never mocked.
    '@server/dbConnect': async () => {},
    'server/dbConnect.js': async () => {},
    '@server/getTenantContext': async () => { calls.cookie++; return { user, tenantId: A } },
    '@models/Users': {
      findById: id => { assert.equal(id, A); return chain(user) },
      findOne: () => chain(user),
    },
    '@models/Tariffs': { findById: id => { assert.equal(id, TARIFF); return chain({ _id: TARIFF, allowProposals: allow }) } },
    '@models/Proposals': { findOne: filter => chain(matches(filter)) },
    '@models/ProposalTemplates': { findOne: filter => chain(matches(filter)) },
    '@models/Events': { exists: async filter => Boolean(matches(filter)) },
    '@models/News': { exists: async () => false },
    '@models/MobileSessions': {},
  })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://cloud.escalion.ru/api')
    assert.equal(options.method, 'POST')
    const directory = options.body.get('directory'), files = options.body.getAll('files')
    calls.network.push({ directory, files })
    return Response.json(files.map(file => ({ url: `https://cloud.escalion.ru/uploads/${directory}/${file.name}` })))
  })
  return {
    calls,
    validate: load('server/validatedUploadFiles.js').validateUploadFiles,
    async send(files, directory = `proposals/${ID}`) {
      const form = new FormData()
      form.append('directory', directory)
      for (const file of files) form.append('files', file)
      // Genuine multipart Request and genuine NextResponse.
      const request = new Request('http://localhost/api/escalioncloud', { method: 'POST', body: form })
      return load('app/api/escalioncloud/route.js').POST(request)
    },
  }
}
function file(bytes, mime) { return new File([bytes], '../untrusted.html', { type: mime }) }
function assertSafe(file, mime, extension) {
  assert.equal(file.type, mime)
  assert.match(file.name, new RegExp(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.${extension}$`))
}
module.exports = { initialize, fixture, file, assertSafe, A, B, ID }
