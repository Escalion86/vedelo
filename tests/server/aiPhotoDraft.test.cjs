const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sharp = require('sharp')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const { harness, imageBody, request } = require('../fixtures/aiPhotoHarness.cjs')
for (const [name, options, status] of [['auth', { unauthorized: true }, 401], ['tariff', { denied: true }, 403]]) {
  test(`${name}: deny before reading body or provider`, async () => {
    const { POST, calls } = await harness(options)
    const response = await POST({ headers: new Headers(), get body() { throw new Error('body read before authorization') } })
    assert.equal(response.status, status); assert.equal(calls.provider.length, 0)
  })
}
for (const role of ['user', 'admin', 'performer', '', null]) {
  for (const actualContext of [false, true]) {
    test(`photo developer rollout denies ${String(role)} (${actualContext ? 'bearer' : 'cookie'}) before body`, async () => {
      const { POST, calls } = await harness({ role, actualContext })
      const response = await POST({ headers: new Headers(actualContext ? { authorization: 'Bearer valid-test-token' } : {}), get body() { throw new Error('body read before developer gate') } })
      assert.equal(response.status, 403)
      assert.equal(calls.provider.length, 0)
      assert.equal(calls.clients.length, 0)
    })
  }
}
test('valid photo: normalized bytes, tenant catalog, result contract, no EVENT write', async () => {
  const { POST, calls } = await harness({ foreign: true })
  const response = await POST(request(await imageBody()))
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.match(value.sourceText, /Анна/)
  assert.equal(value.fields.clientId, 'a')
  assert.deepEqual(value.fields.servicesIds, ['service-a'])
  assert.equal(value.client._id, 'a')
  assert.ok(value.aiFilledFields.includes('contractSum'))
  assert.equal(calls.provider.length, 2)
  const image = calls.provider[0].messages[1].content.find(c => c.type === 'image_url').image_url.url
  const metadata = await sharp(Buffer.from(image.split(',')[1], 'base64')).metadata()
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined)
  assert.equal(calls.clients.length, 0)
})
for (const [name, body, status] of [
  ['url/SSRF', { image: 'https://private.local/photo' }, 400],
  ['SVG', { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, 400],
  ['broken image', { image: 'data:image/png;base64,AAAA' }, 400],
  ['base64 invalid', { image: 'data:image/png;base64,%%%%' }, 400],
  ['oversized file', { image: `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}` }, 413],
]) test(name, async () => {
  const { POST, calls } = await harness(); const response = await POST(request(body))
  assert.equal(response.status, status); assert.equal(calls.provider.length, 0)
})
test('fake MIME rejected by real bytes', async () => {
  const { POST, calls } = await harness()
  const response = await POST(request({ image: (await imageBody()).image.replace('image/png', 'image/jpeg') }))
  assert.equal(response.status, 400); assert.equal(calls.provider.length, 0)
})
test('pixel limit', async () => {
  const { POST, calls } = await harness()
  const bytes = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: 'white' } }).png().toBuffer()
  assert.equal((await POST(request({ image: `data:image/png;base64,${bytes.toString('base64')}` }))).status, 413)
  assert.equal(calls.provider.length, 0)
})
test('body length header and streaming limit before decode', async () => {
  const { POST, calls } = await harness()
  assert.equal((await POST(request({}, { 'content-length': '9000000' }))).status, 413)
  assert.equal((await POST(request({ image: 'x'.repeat(8 * 1024 * 1024) }))).status, 413)
  assert.equal(calls.provider.length, 0)
})
for (const [name, options, status, count] of [
  ['OCR empty', { empty: true }, 422, 1],
  ['OCR provider failure', { failure: 'event_photo_ocr' }, 502, 1],
  ['OCR balance', { balance: 'event_photo_ocr' }, 402, 1],
  ['structure failure no regex fallback', { failure: 'event_draft' }, 502, 2],
  ['structure malformed no regex fallback', { invalidJson: true }, 502, 2],
  ['structure balance', { balance: 'event_draft' }, 402, 2],
  ['DeepSeek unsupported', { provider: 'deepseek' }, 503, 0],
  ['unknown model unsupported', { model: 'custom-text-model' }, 503, 0],
  ['disabled provider', { disabled: true }, 503, 0],
]) test(name, async () => {
  const { POST, calls } = await harness(options); const response = await POST(request(await imageBody()))
  assert.equal(response.status, status); assert.equal(calls.provider.length, count)
  const value = await response.json(); assert.equal(value.fields, null)
  assert.equal(JSON.stringify(value).includes('private-photo'), false)
  assert.equal(calls.clients.length, 0)
})
test('new client only from OCR contacts; client tenant ignores payload', async () => {
  const { POST, calls } = await harness({ noClient: true, text: 'Клиент Борис, телефон 89991234567' })
  assert.equal((await POST(request(await imageBody()))).status, 200)
  assert.equal(calls.clients.length, 1)
  assert.equal(calls.clients[0].tenantId, 'tenant-a')
  assert.equal(calls.clients[0].phone, 79991234567)
  assert.equal(calls.queries.every(q => q.tenantId === 'tenant-a'), true)
})
test('text and voice route retains fallback and contract', async () => {
  const { load } = await harness({ failure: 'event_draft' })
  const response = await load('app/api/events/ai-draft/route.js').POST(request({ text: 'Шоу 15 октября, гонорар 50000 рублей' }))
  assert.equal(response.status, 200); assert.ok((await response.json()).fields)
})

test('cookie context and mobile bearer: real getRequestContext routing', async () => {
  const { POST } = await harness({ actualContext: true })
  assert.equal((await POST(request(await imageBody()))).status, 200)
  assert.equal((await POST(request(await imageBody(), { authorization: 'Bearer valid-test-token' }))).status, 200)
  assert.equal((await POST(request(await imageBody(), { authorization: 'Bearer invalid' }))).status, 401)
  const unauthorized = await harness({ actualContext: true, unauthorized: true })
  assert.equal((await unauthorized.POST(request(await imageBody()))).status, 401)
})

test('JPEG EXIF rotates and strips metadata; PNG/WebP resized to 1600', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    let generator = sharp({ create: { width: 2400, height: 1200, channels: 3, background: 'white' } })
    if (format === 'jpeg') generator = generator.withMetadata({ orientation: 6 })
    const bytes = await generator[format]().toBuffer()
    const { POST, calls } = await harness()
    const response = await POST(request({ image: `data:image/${format};base64,${bytes.toString('base64')}` }))
    assert.equal(response.status, 200)
    const sent = calls.provider[0].messages[1].content.find(c => c.type === 'image_url').image_url.url
    const metadata = await sharp(Buffer.from(sent.split(',')[1], 'base64')).metadata()
    assert.ok(Math.max(metadata.width, metadata.height) <= 1600)
    assert.equal(metadata.orientation, undefined); assert.equal(metadata.exif, undefined)
    if (format === 'jpeg') assert.ok(metadata.height > metadata.width)
  }
})
