const test = require('node:test')
const assert = require('node:assert/strict')
const { read: readStageHFixture } = require('./media.stageH.cjs')
const { loadBindings } = require('next/dist/build/swc')
const sharp = require('sharp')
const { loader, json, chain } = require('../server/stageFLoader.cjs')
const A = 'a'.repeat(24), B = 'b'.repeat(24), ID = 'c'.repeat(24)
let png, mp4, webm
test.before(async () => {
  await loadBindings()
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
  mp4 = readStageHFixture('fragmented.mp4')
  webm = readStageHFixture('stream.webm')
})
function fixture({ allow = true, owner = true, event = true, status = 'draft', role = 'user', authorization = null, tenant = A, userTenant = tenant, userExists = true } = {}) {
  const calls = { upload: [], queries: [], cookie: 0 }
  const user = { _id: A, tenantId: userTenant, role }
  const model = { findOne: f => { calls.queries.push(f); return chain(owner ? { _id: ID, eventId: ID, status } : null) }, exists: async f => { calls.queries.push(f); return event } }
  const load = loader({
    'next/server': { NextResponse: json },
    '@server/getTenantContext': async () => { calls.cookie++; return { user, tenantId: tenant } },
    '@server/mobile/auth': { getMobileUser: async req => req.headers.get('authorization') === 'Bearer fixture-mobile' ? { user } : {} },
    '@server/dbConnect': async () => {},
    '@server/getUserTariffAccess': async () => ({ allowProposals: allow }),
    '@models/Users': { findOne: f => { calls.queries.push(f); return chain(userExists ? user : null) } },
    ...Object.fromEntries(['Proposals','ProposalTemplates','Events'].map(n => ['@models/' + n, model])),
    '@models/News': { exists: async f => { calls.queries.push(f); return owner } },
    '@server/escalionCloud': { uploadFilesToEscalionCloud: async value => { calls.upload.push(value); return value.files.map(f => ({ path: `${value.directory}/${f.name}` })) } },
  })
  return { calls, send: async (directory, files = [new File([png], 'source.png', { type: 'image/png' })], legacy = false, extra = []) => {
    const form = new FormData()
    if (legacy) { form.append('project', 'artistcrm'); form.append('folder', directory) }
    else form.append('directory', directory)
    for (const file of files) form.append('files', file)
    for (const [key, value] of extra) form.append(key, value)
    return load('app/api/escalioncloud/route.js').POST({ headers: new Headers(authorization === null ? {} : { authorization }), formData: async () => form })
  } }
}
for (const directory of [
  `vedelo/${B}/review-page/logo/fixture`, `artistcrm/${B}/review-page/logo/fixture`,
  `vedelo/${A}/review-page/logo/fixture`, `artistcrm/${A}/review-page/logo/fixture`,
  'artistcrm/../../foreign', 'artistcrm/./users', 'artistcrm/users/../services', 'artistcrm\\users',
  'artistcrm/%2e%2e/foreign', 'artistcrm/users%2fother', 'artistcrm/users%5cother', 'artistcrm/%252e%252e/foreign',
  'artistcrm//users', '/artistcrm/users/', 'foreign/users', 'artistcrm/temp', `artistcrm/${B}/mobile`, `artistcrm/${B}/mobile/profile`,
  `artistcrm/${B}/proposals/${ID}`, `artistcrm/${A}/services`,
]) test(`SEC-02 denies destination ${directory}`, async () => {
  const f = fixture({ allow: false, owner: false })
  assert.equal((await f.send(directory)).status, 400)
  assert.equal(f.calls.upload.length, 0)
})
for (const [directory, options, status] of [
  [`proposals/${ID}`, { allow: false }, 403], [`proposals/${ID}`, { owner: false }, 404],
  [`proposals/${ID}`, { event: false }, 404], [`proposals/${ID}`, { status: 'published' }, 409],
  ['proposal-templates/arbitrary', {}, 400], ['artistcrm/news/draft', {}, 403],
  [`artistcrm/news/${ID}`, { role: 'dev', owner: false }, 404],
  [`artistcrm/${A}/mobile/profile`, { userExists: false }, 404],
  [`artistcrm/${A}/mobile/profile`, { userTenant: B }, 404],
  ['artistcrm/users', { userExists: false }, 404],
]) test(`SEC-02 owner/option/role ${directory} ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); assert.equal((await f.send(directory)).status, status); assert.equal(f.calls.upload.length, 0)
})
for (const [directory, options, target, legacy] of [
  ['artistcrm/users', {}, 'artistcrm/users'], ['users', {}, 'artistcrm/users', true],
  ['artistcrm/services', {}, 'artistcrm/services'], ['services', {}, 'artistcrm/services', true],
  ['artistcrm/news/draft', { role: 'dev' }, 'artistcrm/news/draft'],
  [`artistcrm/news/${ID}`, { role: 'dev' }, `artistcrm/news/${ID}`],
  [`artistcrm/${A}/mobile`, {}, `artistcrm/${A}/mobile`], [`artistcrm/${A}/mobile/profile`, {}, `artistcrm/${A}/mobile/profile`],
  [`proposals/${ID}`, {}, `artistcrm/${A}/proposals/${ID}`], [`artistcrm/proposals/${ID}`, {}, `artistcrm/${A}/proposals/${ID}`],
  [`proposal-templates/${ID}`, {}, `artistcrm/${A}/proposal-templates/${ID}`], ['artistcrm/proposal-templates/draft', {}, `artistcrm/${A}/proposal-templates/draft`],
  ['proposal-templates/550e8400-e29b-41d4-a716-446655440000', {}, `artistcrm/${A}/proposal-templates/550e8400-e29b-41d4-a716-446655440000`],
]) test(`SEC-02 legitimate destination ${directory}`, async () => {
  const f = fixture(options); assert.equal((await f.send(directory, undefined, legacy)).status, 200)
  assert.equal(f.calls.upload[0].directory, target)
  for (const q of f.calls.queries) if ('tenantId' in q) assert.equal(q.tenantId, A)
})
for (const directory of [`proposals/${ID}`, 'artistcrm/users', 'artistcrm/services', 'artistcrm/news/draft', `artistcrm/${A}/mobile/profile`])
for (const [content, name, type] of [
  ['<script>attack()</script>', 'file.html', 'image/png'], ['not png', 'file.png', 'image/png'],
  ['<html></html>', 'file.mp4', 'video/mp4'], ['not webm', 'file.webm', 'video/webm'],
  ['<svg onload="attack()"/>', 'file.svg', 'image/png'],
]) test(`SEC-03 fake bytes ${directory} ${name}`, async () => {
  const f = fixture({ role: 'dev' }); assert.equal((await f.send(directory, [new File([content], name, { type })])).status, 400); assert.equal(f.calls.upload.length, 0)
})
for (const [format, mime] of [['jpeg','image/jpeg'], ['png','image/png'], ['webp','image/webp'], ['gif','image/gif']]) test(`SEC-03 real decoded ${format}, safe filename`, async () => {
  const bytes = await sharp(png).toFormat(format).toBuffer(), f = fixture()
  assert.equal((await f.send(`proposals/${ID}`, [new File([bytes], '../attack.html', { type: mime })])).status, 200)
  const uploaded = f.calls.upload[0].files[0]
  assert.match(uploaded.name, new RegExp(`^[a-f0-9-]+\\.${format === 'jpeg' ? 'jpg' : format}$`))
  assert.equal((await sharp(Buffer.from(await uploaded.arrayBuffer())).metadata()).format, format)
})
test('SEC-03 format derived from bytes rather than name/MIME', async () => {
  const f = fixture(); assert.equal((await f.send(`proposals/${ID}`, [new File([png], 'attack.html', { type: 'image/jpeg' })])).status, 200)
  assert.match(f.calls.upload[0].files[0].name, /\.png$/); assert.equal(f.calls.upload[0].files[0].type, 'image/png')
})
for (const [label, mime] of [['mp4', 'video/mp4'], ['webm','video/webm']]) test(`SEC-03 real video ${label}, safe filename`, async () => {
  const f = fixture(), bytes = label === 'mp4' ? mp4 : webm
  assert.equal((await f.send(`proposals/${ID}`, [new File([bytes], '../attack.html', { type: mime })])).status, 200)
  assert.match(f.calls.upload[0].files[0].name, new RegExp(`^[a-f0-9-]+\\.${label}$`))
})
for (const size of [40, 45, 50, 51]) test(`LOG-01 real MP4 ${size} MiB`, async () => {
  // Valid MP4 container plus a correctly sized free box, no fake size getter.
  const padding = Buffer.alloc(size * 1024 * 1024 - mp4.length); padding.writeUInt32BE(padding.length); padding.write('free', 4)
  const f = fixture(), result = await f.send(`proposals/${ID}`, [new File([mp4, padding], 'movie.mp4', { type: 'video/mp4' })])
  assert.equal(result.status, size <= 50 ? 200 : 400); assert.equal(f.calls.upload.length, size <= 50 ? 1 : 0)
})
test('SEC-03 truncated image and mixed batch never upload', async () => {
  for (const files of [[new File([png.subarray(0, 40)], 'a.png', { type: 'image/png' })], [new File([png], 'ok.png', { type: 'image/png' }), new File(['HTML'], 'bad.png', { type: 'image/png' })]]) {
    const f = fixture(); assert.equal((await f.send(`proposals/${ID}`, files)).status, 400); assert.equal(f.calls.upload.length, 0)
  }
})
for (const header of ['', 'Basic value', 'Bearer', 'Bearer: value', 'Bearer fixture-mobile,other']) test(`upload malformed auth ${JSON.stringify(header)}`, async () => {
  const f = fixture({ authorization: header }); assert.equal((await f.send(`proposals/${ID}`)).status, 401); assert.equal(f.calls.cookie, 0); assert.equal(f.calls.upload.length, 0)
})

for (const label of ['ftyp-only', 'bad-box-size', 'webm-matroska', 'truncated-webm']) test(`SEC-03 invalid video container ${label}`, async () => {
  let bytes, type = 'video/mp4'
  if (label === 'ftyp-only') bytes = mp4.subarray(0, mp4.readUInt32BE(0))
  if (label === 'bad-box-size') { bytes = Buffer.from(mp4); bytes.writeUInt32BE(bytes.length + 1, 0) }
  if (label === 'webm-matroska') { type = 'video/webm'; bytes = Buffer.from(webm); bytes.write('evil', bytes.indexOf('webm')) }
  if (label === 'truncated-webm') { type = 'video/webm'; bytes = webm.subarray(0, 5) }
  const f = fixture(); assert.equal((await f.send(`proposals/${ID}`, [new File([bytes], 'fake.html', { type })])).status, 400); assert.equal(f.calls.upload.length, 0)
})
test('SEC-03 image limit and unsupported MIME reject before upstream', async () => {
  for (const file of [new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), new File([png], 'image.png', { type: 'text/html' })]) {
    const f = fixture(); assert.equal((await f.send(`proposals/${ID}`, [file])).status, 400); assert.equal(f.calls.upload.length, 0)
  }
})
test('SEC-02 mobile generic file contract retains documents in own directory', async () => {
  const f = fixture(); assert.equal((await f.send(`artistcrm/${A}/mobile`, [new File(['synthetic document'], 'note.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })])).status, 200)
  assert.equal(f.calls.upload[0].directory, `artistcrm/${A}/mobile`)
})

for (const extra of [[['directory', 'artistcrm/users']], [['project', 'artistcrm'], ['folder', 'users']], [['folder', '../foreign']]]) test(`SEC-02 ambiguous multipart ${JSON.stringify(extra)}`, async () => {
  const f = fixture(); assert.equal((await f.send(`proposals/${ID}`, undefined, false, extra)).status, 400); assert.equal(f.calls.upload.length, 0)
})
test('SEC-02 mobile/avatar retains one file and 5 MiB server limit', async () => {
  for (const directory of [`artistcrm/${A}/mobile`, `artistcrm/${A}/mobile/profile`]) {
    for (const files of [[new File([Buffer.alloc(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })], [new File([png], 'one.png', { type: 'image/png' }), new File([png], 'two.png', { type: 'image/png' })]]) {
      const f = fixture(); assert.equal((await f.send(directory, files)).status, 400); assert.equal(f.calls.upload.length, 0)
    }
  }
})
