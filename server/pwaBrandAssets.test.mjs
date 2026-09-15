import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const readProjectFile = (relativePath) =>
  readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('PWA manifest references only versioned Vedelo icons that exist', () => {
  const manifest = JSON.parse(readProjectFile('public/manifest.json'))

  assert.equal(manifest.name, 'Ведело')
  assert.equal(manifest.short_name, 'Ведело')
  assert.equal(manifest.id, '/')
  assert.ok(manifest.icons.length > 0)

  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/icons\/vedelo-v1\//)
    assert.equal(
      existsSync(path.join(projectRoot, 'public', icon.src.slice(1))),
      true,
      `Missing PWA icon: ${icon.src}`
    )
  }
})

test('service worker precaches the versioned primary Vedelo icons', () => {
  const serviceWorkerSource = readProjectFile('server/serviceWorkerScript.js')

  assert.match(serviceWorkerSource, /vedelo-custom-sw-v5/)
  assert.match(
    serviceWorkerSource,
    /\/icons\/vedelo-v1\/android\/android-launchericon-192-192\.png/
  )
  assert.match(
    serviceWorkerSource,
    /\/icons\/vedelo-v1\/android\/android-launchericon-512-512\.png/
  )
  assert.doesNotMatch(
    serviceWorkerSource,
    /\/icons\/AppImages\/android\/android-launchericon-/
  )
})
