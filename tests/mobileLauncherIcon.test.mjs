import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { createRequire } from 'node:module'
import os from 'node:os'
const require = createRequire(new URL('../mobile/package.json', import.meta.url))
const icons = require(new URL('../mobile/node_modules/expo/node_modules/@expo/cli/node_modules/@expo/prebuild-config/build/plugins/icons/withAndroidIcons.js', import.meta.url).pathname)

const root = new URL('../', import.meta.url).pathname
const app = JSON.parse(await fs.readFile(path.join(root, 'mobile/app.json'), 'utf8')).expo

test('Android uses the full-colour PWA bitmap rather than adaptive layers', () => {
  assert.equal(app.android.adaptiveIcon, undefined)
  assert.equal(app.android.icon, app.icon)
  assert.equal(app.android.package, 'ru.escalion.vedelo')
})

test('launcher bitmap matches the PWA colours and proportions', async () => {
  const actual = await sharp(path.join(root, 'mobile', app.icon)).resize(512, 512).ensureAlpha().raw().toBuffer()
  const expected = await sharp(path.join(root, 'public/icons/vedelo-v1/android/android-launchericon-512-512.png')).ensureAlpha().raw().toBuffer()
  const error = actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) / actual.length
  assert.ok(error < 1, `Mean pixel error: ${error}`)
})

test('Expo generates bitmap launcher resources without adaptive XML or roundIcon', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'vedelo-launcher-'))
  try {
    const res = path.join(work, 'android/app/src/main/res')
    for (const dpi of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      await fs.mkdir(path.join(res, `mipmap-${dpi}`), { recursive: true })
    }
    await icons.setIconAsync(work, {
      icon: path.join(root, 'mobile', app.android.icon),
      isAdaptive: Boolean(app.android.adaptiveIcon),
    })
    await assert.rejects(fs.access(path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml')))
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:roundIcon': '@mipmap/ic_launcher_round' } }] } }
    icons.setRoundIconManifest(app, manifest)
    assert.equal(manifest.manifest.application[0].$['android:roundIcon'], undefined)
    for (const dpi of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const file = path.join(res, `mipmap-${dpi}/ic_launcher.webp`)
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const pos = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
      assert.ok(data[pos] > 240 && data[pos + 1] > 240 && data[pos + 2] > 230)
      assert.ok(info.width >= 48)
    }
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
})
