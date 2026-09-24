const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const cache = new Map()
const mocks = {
  jotai: { useAtomValue: () => ({}) },
  '@components/ClientChatButton': { __esModule: true, default: () => null },
  '@components/NovofonCallButton': { __esModule: true, default: () => null },
  '@helpers/useSnackbar': { __esModule: true, default: () => ({}) },
  '@state/atoms': { modalsFuncAtom: {} },
  '@state/atoms/itemsFuncAtom': { __esModule: true, default: {} },
}

function loadModule(file) {
  const filename = path.resolve(file)
  if (cache.has(filename)) return cache.get(filename).exports

  const loaded = { exports: {} }
  cache.set(filename, loaded)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const resolve = (id) => {
    if (id in mocks) return mocks[id]
    if (id === '@helpers/maxContact') return loadModule('helpers/maxContact.js')
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(resolve, loaded, loaded.exports)
  return loaded.exports
}

test.before(async () => loadBindings())

test('only the preferred available contact gets the sand marker', () => {
  const Contacts = loadModule('components/ContactsIconsButtons.js').default
  const baseUser = {
    phone: '79991234567',
    whatsapp: '79991234567',
    max: '+79991234567',
  }

  for (const channel of ['max', 'whatsapp']) {
    const html = renderToStaticMarkup(
      React.createElement(Contacts, {
        user: { ...baseUser, preferredContactChannel: channel },
        compactButtons: true,
      })
    )
    const document = new JSDOM(html).window.document
    const marked = [...document.querySelectorAll('[data-preferred-contact="true"]')]

    assert.equal(marked.length, 1)
    assert.equal(marked[0].tagName, 'BUTTON')
    assert.match(marked[0].getAttribute('aria-label'), /приоритетный канал связи/)
    assert.equal(marked[0].textContent.includes('MAX'), channel === 'max')
  }

  const styles = readFileSync(path.resolve('app/globals.css'), 'utf8')
  assert.match(styles, /button\[data-preferred-contact='true'\][\s\S]*?border-bottom: 3px solid var\(--ui-primary\) !important/)

  const noContactHtml = renderToStaticMarkup(
    React.createElement(Contacts, {
      user: { phone: '79991234567', preferredContactChannel: 'vk' },
      compactButtons: true,
    })
  )
  assert.doesNotMatch(noContactHtml, /data-preferred-contact/)
})
