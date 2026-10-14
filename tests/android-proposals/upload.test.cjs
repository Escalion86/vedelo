const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const { loader } = require('../server/stageFLoader.cjs')
let png
test.before(async () => {
  await loadBindings()
  png = await require('sharp')({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
})
function fixture({
  tenantId = 'a'.repeat(24),
  allow = true,
  owner = true,
  status = 'draft',
  filenameOnly = false,
  authorization = null,
} = {}) {
  const calls = []
  const models = {
    findOne: (filter) => {
      calls.push(['find', filter])
      return {
        lean: async () =>
          owner
            ? { _id: 'b'.repeat(24), eventId: 'c'.repeat(24), status }
            : null,
      }
    },
    exists: async (filter) => {
      calls.push(['exists', filter])
      return owner
    },
  }
  const mocks = {
    '@server/validatedUploadFiles': loader()('server/validatedUploadFiles.js'),
    '@helpers/escalionCloudUpload.mjs': require('../../helpers/escalionCloudUpload.mjs'),
    'next/server': {
      NextResponse: {
        json: (body, opts = {}) => ({ body, status: opts.status || 200 }),
      },
    },
    '@server/getRequestContext': async () => ({
      tenantId,
      user: tenantId ? { _id: 'u' } : null,
    }),
    '@server/getUserTariffAccess': async () => ({ allowProposals: allow }),
    '@helpers/proposalAccess': {
      canUseProposalBuilder: (a) => Boolean(a?.allowProposals),
    },
    '@server/dbConnect': async () => {},
    '@server/escalionCloud': {
      uploadFilesToEscalionCloud: async (value) => {
        calls.push(['upload', value])
        return filenameOnly
          ? [{ fileName: 'file.png' }]
          : [{ path: `${value.directory}/file.png` }]
      },
    },
    mongoose: {
      Types: {
        ObjectId: { isValid: (value) => /^[a-f0-9]{24}$/i.test(value) },
      },
    },
  }
  for (const name of ['Proposals', 'ProposalTemplates', 'Events', 'Users', 'News'])
    mocks[`@models/${name}`] = models
  const { code } = transformSync(
    fs.readFileSync('app/api/escalioncloud/route.js', 'utf8'),
    {
      filename: 'app/api/escalioncloud/route.js',
      jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
      module: { type: 'commonjs' },
    }
  )
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', 'process', code)(
    (name) => {
      if (!(name in mocks)) throw Error(name)
      return mocks[name]
    },
    mod,
    mod.exports,
    { env: { ESCALIONCLOUD_PASSWORD: 'synthetic-upload-fixture' } }
  )
  return {
    calls,
    send: async (
      directory,
      file = new File([png], 'a.png', { type: 'image/png' })
    ) => {
      const form = new FormData()
      form.append('directory', directory)
      form.append('files', file)
      return await mod.exports.POST({
        headers: { get: () => authorization },
        formData: async () => form,
      })
    },
  }
}
test('modern proposal upload path gets tenant segment and owner check', async () => {
  const f = fixture()
  const result = await f.send(`proposals/${'b'.repeat(24)}`)
  assert.equal(result.status, 200)
  assert.equal(
    f.calls.find((c) => c[0] === 'upload')[1].directory,
    `artistcrm/${'a'.repeat(24)}/proposals/${'b'.repeat(24)}`
  )
  assert.ok(
    f.calls.find((c) => c[0] === 'find' && c[1].tenantId === 'a'.repeat(24))
  )
})
test('legacy web upload path still scoped to tenant', async () => {
  const f = fixture()
  const result = await f.send(`artistcrm/proposals/${'b'.repeat(24)}`)
  assert.equal(result.status, 200)
  assert.equal(
    f.calls.find((c) => c[0] === 'upload')[1].directory,
    `artistcrm/${'a'.repeat(24)}/proposals/${'b'.repeat(24)}`
  )
})
test('foreign proposal does not reach upstream', async () => {
  const f = fixture({ owner: false })
  assert.equal((await f.send(`proposals/${'b'.repeat(24)}`)).status, 404)
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})
test('published proposal upload denied', async () => {
  const f = fixture({ status: 'published' })
  assert.equal((await f.send(`proposals/${'b'.repeat(24)}`)).status, 409)
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})
test('tariff denied before upload', async () => {
  const f = fixture({ allow: false })
  assert.equal(
    (await f.send(`proposal-templates/${'b'.repeat(24)}`)).status,
    403
  )
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})
test('crafted tenant path cannot bypass proposal ownership', async () => {
  const f = fixture()
  assert.equal(
    (await f.send(`artistcrm/${'f'.repeat(24)}/proposals/${'b'.repeat(24)}`))
      .status,
    400
  )
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})
test('active unsaved template uses server tenant scope', async () => {
  const f = fixture()
  assert.equal(
    (await f.send('proposal-templates/550e8400-e29b-41d4-a716-446655440000'))
      .status,
    200
  )
  assert.ok(
    f.calls
      .find((c) => c[0] === 'upload')[1]
      .directory.startsWith(`artistcrm/${'a'.repeat(24)}/proposal-templates/`)
  )
})
test('HTML disguised as media fails without upload', async () => {
  const f = fixture()
  assert.equal(
    (
      await f.send(
        `proposals/${'b'.repeat(24)}`,
        new File(['<script>attack()</script>'], 'a.html', { type: 'text/html' })
      )
    ).status,
    400
  )
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})

test('filename-only upstream is resolved on server with authenticated tenant directory', async () => {
  const f = fixture({ filenameOnly: true })
  const result = await f.send(`proposals/${'b'.repeat(24)}`)
  assert.equal(
    result.body.data.url,
    `https://cloud.escalion.ru/uploads/artistcrm/${'a'.repeat(24)}/proposals/${'b'.repeat(24)}/file.png`
  )
})

test('malformed authorization never falls back to cookie upload', async () => {
  const f = fixture({ authorization: 'bearer invalid' })
  assert.equal((await f.send(`proposals/${'b'.repeat(24)}`)).status, 401)
  assert.ok(!f.calls.some((c) => c[0] === 'upload'))
})
