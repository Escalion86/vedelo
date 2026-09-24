const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
})
global.window = dom.window
global.document = dom.window.document
global.Node = dom.window.Node
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
global.IS_REACT_ACT_ENVIRONMENT = true

const { createRoot } = require('react-dom/client')
const { act } = React
const state = { novofonEnabled: false, allowTelephony: false }
const atoms = { user: Symbol('user'), site: Symbol('site'), tariffs: Symbol('tariffs') }
const mocks = {
  'jotai': {
    useAtomValue: (atom) => {
      if (atom === atoms.user) return { _id: 'user-1' }
      if (atom === atoms.site) return { custom: { novofonEnabled: state.novofonEnabled } }
      return []
    },
  },
  '@helpers/customSettings': { getCustomValue: (custom, key) => custom[key] },
  '@helpers/tariffAccess': { getUserTariffAccess: () => ({ allowTelephony: state.allowTelephony }) },
  '@state/atoms/loggedUserAtom': { __esModule: true, default: atoms.user },
  '@state/atoms/siteSettingsAtom': { __esModule: true, default: atoms.site },
  '@state/atoms/tariffsAtom': { __esModule: true, default: atoms.tariffs },
}
const cache = new Map()

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
    if (id === '@components/DropDown') return loadModule('components/DropDown.js')
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(resolve, loaded, loaded.exports)
  return loaded.exports
}

test.before(async () => loadBindings())
test.after(() => dom.window.close())

test('phone opens call choices only when Novofon is enabled and allowed', async () => {
  const CallButton = loadModule('components/NovofonCallButton.js').default
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const client = { _id: 'client-1', phone: 79991234567 }
  const opened = []
  window.open = (url) => opened.push(url)

  await act(async () => root.render(React.createElement(CallButton, { client })))
  assert.equal(container.querySelector('[aria-haspopup="menu"]'), null)
  assert.equal(container.querySelector('[data-preferred-contact]'), null)
  await act(async () => container.querySelector('button').click())
  assert.deepEqual(opened, ['tel:+79991234567'])

  state.novofonEnabled = true
  await act(async () => root.render(React.createElement(CallButton, { client })))
  assert.equal(container.querySelector('[aria-haspopup="menu"]'), null)

  state.allowTelephony = true
  await act(async () =>
    root.render(React.createElement(CallButton, { client, preferred: true }))
  )
  assert.ok(container.querySelector('[aria-haspopup="menu"]'))
  const preferredButton = container.querySelector('[data-preferred-contact="true"]')
  assert.ok(preferredButton)
  assert.match(container.querySelector('button').getAttribute('aria-label'), /приоритетный канал связи/)
  await act(async () => container.querySelector('button').click())
  assert.equal(opened.length, 1)
  assert.ok(document.querySelector('[role="menuitem"]'))
  assert.deepEqual(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim()),
    ['Позвонить', 'Позвонить через Novofon']
  )
  await act(async () => document.querySelector('[role="menuitem"]').click())
  assert.deepEqual(opened, ['tel:+79991234567', 'tel:+79991234567'])

  await act(async () => root.unmount())
  container.remove()
})
