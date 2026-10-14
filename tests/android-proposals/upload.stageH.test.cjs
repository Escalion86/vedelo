const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const sharp = require('sharp')
const manifest = require('./fixtures.stageH/manifest.stageH.json')
const { read, paddedMp4, invalidCases } = require('./media.stageH.cjs')
const { initialize, fixture, file, assertSafe, B, ID } = require('./upload-helper.stageH.cjs')

test.before(initialize)
test('stageH fixtures: frozen real ffmpeg bytes and GIF pixel facts', async () => {
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = read(name)
    assert.equal(bytes.length, expected.bytes)
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256)
  }
  const metadata = await sharp(read('animated-128x128x50.gif'), { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).metadata()
  assert.equal(metadata.width, 128)
  assert.equal(metadata.pageHeight, 128)
  assert.equal(metadata.pages, 50)
  assert.equal(metadata.height, 6400)
  assert.equal(metadata.width * metadata.height, 819200)
  assert.ok(metadata.width * metadata.height * metadata.pages > 40000000, 'baseline double-count exposes LOG-03')
  const oversized = await sharp(read('over-40M.gif'), { animated: true, limitInputPixels: false }).metadata()
  assert.ok(oversized.width * oversized.height > 40000000)
  assert.ok(read('over-40M.gif').length < 10 * 1024 * 1024, 'negative isolates pixel budget, not file limit')
})

// Separate assertions show both the direct helper defect and real POST/network
// consequences. No assertion runs conditionally on a validator result.
for (const label of [
  'reviewer-html-moov-mdat', 'reviewer-x-Info-Tracks-Cluster', 'html-Info-Tracks-Cluster',
  'real-mp4-damaged-moov-child', 'real-mp4-html-moov', 'real-mp4-damaged-sample-table', 'real-mp4-damaged-fragment',
  'real-webm-damaged-Tracks-child', 'real-webm-damaged-Cluster-block', 'real-webm-invalid-block-track',
  'real-mp4-no-video-track', 'real-webm-no-video-track', 'html-claimed-image-png',
]) {
  const id = label === 'html-claimed-image-png' ? 'SEC-03 compatibility' : 'SEC-03-R1'
  for (const boundary of ['validate', 'POST-status', 'POST-no-upstream']) {
    test(`${id} ${label} ${boundary}`, async t => {
      const [, bytes, mime] = invalidCases().find(([name]) => name === label)
      const f = fixture(t), files = [file(bytes, mime)]
      if (boundary === 'validate') {
        assert.equal(await f.validate(files), null, `${label}: real validator must reject invalid internal content`)
      } else {
        const response = await f.send(files)
        if (boundary === 'POST-status') {
          assert.equal(response.status, 400, `${label}: real POST must return validation error`)
          assert.equal((await response.json()).data.error.type, 'VALIDATION_ERROR')
        } else {
          assert.equal(f.calls.network.length, 0, `${label}: no actual cloud fetch before rejection`)
        }
      }
    })
  }
}

for (const [name, mime, extension] of [
  ['regular.mp4', 'video/mp4', 'mp4'], ['free45MiB', 'video/mp4', 'mp4'],
  ['fragmented.mp4', 'video/mp4', 'mp4'], ['stream.webm', 'video/webm', 'webm'],
  ['unknown-clusters.webm', 'video/webm', 'webm'],
]) test(`SEC-03-R1 genuine positive ${name} validate and POST`, async t => {
  const bytes = name === 'free45MiB' ? paddedMp4(45) : read(name), f = fixture(t)
  const validated = await f.validate([file(bytes, mime)])
  assert.ok(validated, `real ${name} must remain accepted`)
  assertSafe(validated[0], mime, extension)
  assert.deepEqual(Buffer.from(await validated[0].arrayBuffer()), bytes)
  const response = await f.send([file(bytes, mime)])
  assert.equal(response.status, 200)
  assert.equal((await response.json()).success, true)
  assert.equal(f.calls.network.length, 1)
  assertSafe(f.calls.network[0].files[0], mime, extension)
  assert.deepEqual(Buffer.from(await f.calls.network[0].files[0].arrayBuffer()), bytes)
})

for (const boundary of ['validate-decode-reencode', 'POST-decode-reencode']) {
  test(`LOG-03 actual 128x128x50 GIF ${boundary}`, async t => {
    const original = read('animated-128x128x50.gif'), f = fixture(t)
    // Independent real decoder establishes this is a legitimate GIF under 40M.
    const reference = await sharp(original, { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).gif().toBuffer()
    assert.ok(reference.length > 0)
    let output
    if (boundary === 'validate-decode-reencode') {
      const validated = await f.validate([file(original, 'image/gif')])
      assert.ok(validated, 'LOG-03: 819200 actual pixels must pass the unchanged 40000000 budget')
      output = validated[0]
    } else {
      const response = await f.send([file(original, 'image/gif')])
      assert.equal(response.status, 200, 'LOG-03: legitimate web GIF must reach upstream after real reencode')
      assert.equal(f.calls.network.length, 1)
      output = f.calls.network[0].files[0]
    }
    assertSafe(output, 'image/gif', 'gif')
    const bytes = Buffer.from(await output.arrayBuffer())
    assert.notDeepEqual(bytes, original, 'image must really be reencoded')
    const meta = await sharp(bytes, { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).metadata()
    assert.equal(meta.width, 128)
    assert.equal(meta.pageHeight, 128)
    assert.equal(meta.pages, 50)
    await sharp(bytes, { animated: true, limitInputPixels: 40000000, failOn: 'warning' }).gif().toBuffer()
  })
}

test('LOG-03 actual >40M GIF rejected by validate and POST without upstream', async t => {
  const f = fixture(t), bytes = read('over-40M.gif')
  assert.equal(await f.validate([file(bytes, 'image/gif')]), null)
  const response = await f.send([file(bytes, 'image/gif')])
  assert.equal(response.status, 400)
  assert.equal(f.calls.network.length, 0)
})
test('SEC-03-R1 mixed valid/invalid batch is rejected atomically before fetch', async t => {
  const f = fixture(t), [, bad, mime] = invalidCases()[0]
  const files = [file(read('regular.mp4'), 'video/mp4'), file(bad, mime)]
  assert.equal(await f.validate(files), null)
  assert.equal((await f.send(files)).status, 400)
  assert.equal(f.calls.network.length, 0)
})
test('stageH real POST foreign tenant ownership rejects before validation/upstream', async t => {
  const f = fixture(t, { foreign: true })
  assert.equal((await f.send([file(read('regular.mp4'), 'video/mp4')])).status, 404)
  assert.equal(f.calls.network.length, 0)
  assert.equal((await f.send([file(read('regular.mp4'), 'video/mp4')], `artistcrm/${B}/proposals/${ID}`)).status, 400)
  assert.equal(f.calls.network.length, 0)
})
test('stageH real tariff logic rejects before upstream', async t => {
  const f = fixture(t, { allow: false })
  assert.equal((await f.send([file(read('regular.mp4'), 'video/mp4')])).status, 403)
  assert.equal(f.calls.network.length, 0)
})
test('stageH web 50MiB and mobile 5MiB limits retained', async t => {
  const f = fixture(t), tooLarge = paddedMp4(51)
  assert.equal(await f.validate([file(tooLarge, 'video/mp4')]), null)
  assert.equal((await f.send([file(tooLarge, 'video/mp4')])).status, 400)
  assert.equal(await f.validate([file(paddedMp4(6), 'video/mp4')], { generic: true }), null)
  assert.equal(f.calls.network.length, 0)
})
