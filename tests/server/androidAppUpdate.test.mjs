import assert from 'node:assert/strict'
import test from 'node:test'
import { GET } from '../../app/api/mobile/v1/app-update/route.js'

const production = 'ru.escalion.vedelo'
const development = 'ru.escalion.vedelo.dev'
const release = {
  packageName: production,
  versionName: '1.1.5',
  versionCode: 31,
  downloadUrl: 'https://cloud.escalion.ru/api/files/release/download',
}

const request = (packageName, channel) => {
  const search = new URLSearchParams({ packageName })
  if (channel) search.set('channel', channel)
  return GET(new Request(`https://vedelo.ru/api/mobile/v1/app-update?${search}`))
}

test('returns only valid public release metadata for the requested Android channel', async (t) => {
  const keys = ['ANDROID_APK_RELEASE', 'ANDROID_EAS_APK_RELEASE', 'ANDROID_DEV_APK_RELEASE']
  const previous = keys.map((key) => [key, process.env[key]])
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  process.env.ANDROID_APK_RELEASE = JSON.stringify({ ...release, privateField: 'not public metadata' })
  const easRelease = { ...release, downloadUrl: 'https://vedelo.ru/downloads/vedelo-eas.apk' }
  process.env.ANDROID_EAS_APK_RELEASE = JSON.stringify(easRelease)
  process.env.ANDROID_DEV_APK_RELEASE = JSON.stringify({
    ...release,
    packageName: development,
    downloadUrl: 'https://vedelo.ru/downloads/vedelo-dev.apk',
  })

  const response = await request(production)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual((await response.json()).data, release)
  assert.deepEqual((await (await request(production, 'eas-apk')).json()).data, easRelease)
  assert.equal((await request(development, 'eas-apk')).status, 400)
  assert.equal((await request(production, 'play')).status, 400)
  const dev = await request(development)
  assert.equal((await dev.json()).data.packageName, development)

  delete process.env.ANDROID_DEV_APK_RELEASE
  assert.deepEqual(await (await request(development)).json(), { success: true, data: null })
  assert.equal((await request('ru.escalion.artistcrm')).status, 400)
  assert.equal((await request('__proto__')).status, 400)

  for (const invalid of [
    { packageName: development },
    { versionCode: '32' },
    { versionCode: 0 },
    { versionCode: 2100000001 },
    { versionName: '1.1.5\nnext' },
    { downloadUrl: 'https://vedelo.ru.example.com/vedelo.apk' },
    { downloadUrl: 'https://user@vedelo.ru/vedelo.apk' },
    { downloadUrl: 'http://vedelo.ru/vedelo.apk' },
    { downloadUrl: 'https://vedelo.ru:8443/vedelo.apk' },
    { downloadUrl: 'https://vedelo.ru/vedelo.apk#fragment' },
  ]) {
    process.env.ANDROID_APK_RELEASE = JSON.stringify({ ...release, ...invalid })
    const rejected = await request(production)
    assert.equal(rejected.status, 503)
    assert.equal((await rejected.json()).data, undefined)
  }
  process.env.ANDROID_APK_RELEASE = '{invalid'
  assert.equal((await request(production)).status, 503)
})
