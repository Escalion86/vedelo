const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const dom = new JSDOM('<!doctype html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
const cache = new Map()
function load(file) {
  const full = path.resolve(file)
  if (cache.has(full)) return cache.get(full)
  const mod = { exports: {} }
  const { code } = transformSync(fs.readFileSync(full, 'utf8'), {
    filename: full,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  const resolve = (name) => {
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key })
    if (name === 'next/image') return (props) => React.createElement('img', { alt: props.alt, src: props.src })
    if (/^@(helpers|components)\//.test(name)) return load(name.slice(1) + (path.extname(name) ? '' : '.js'))
    if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name) + (path.extname(name) ? '' : '.js'))
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  cache.set(full, mod.exports)
  return mod.exports
}
const base = {
  title: 'Тестовое КП', status: 'published',
  blocks: [{ type: 'packages', title: 'Варианты', enabled: true }],
  packages: [
    { id: 'basic', title: 'Основной', total: 3500, lines: [] },
    { id: 'extended', title: 'Полный', total: 4000, lines: [] },
  ],
  selectedPackageId: 'basic', selectionLocked: false,
}
async function mount(t, component, props) {
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  await React.act(async () => root.render(React.createElement(component, props)))
  t.after(async () => {
    await React.act(async () => root.unmount())
    element.remove()
  })
  return element
}
test.before(() => loadBindings())

test('утверждённое КП: настоящий рендер блокирует обе кнопки и сообщает о новой версии', async (t) => {
  const View = load('components/ProposalPageView.js').default
  let calls = 0
  const element = await mount(t, View, {
    proposal: { ...base, selectionLocked: true, appliedPackageId: 'basic' },
    selectPackage: () => { calls++ },
  })
  const buttons = [...element.querySelectorAll('button')]
  assert.equal(buttons.length, 2)
  assert.ok(buttons.every((button) => button.disabled))
  assert.match(element.querySelector('[role="status"]').textContent, /утверждён.*новая версия/s)
  assert.equal(buttons[0].textContent, 'Вариант утверждён')
  await React.act(async () => buttons.forEach((button) => button.click()))
  assert.equal(calls, 0)
})

test('pending блокирует выбор без ложного утверждения в public и preview', async (t) => {
  const View = load('components/ProposalPageView.js').default
  for (const preview of [false, true]) {
    const element = await mount(t, View, { proposal: { ...base, selectionLocked: true, applicationPending: true }, preview })
    assert.ok([...element.querySelectorAll('button')].every((button) => button.disabled))
    assert.match(element.querySelector('[role="status"]').textContent, /ожидает.*сверки/s)
    assert.doesNotMatch(element.textContent, /уже утверждён|Вариант утверждён/)
  }
})

test('до утверждения реальное нажатие меняет вариант; preview и expired остаются read-only', async (t) => {
  const View = load('components/ProposalPageView.js').default
  const calls = []
  const element = await mount(t, View, { proposal: base, selectPackage: (id) => calls.push(id) })
  const buttons = [...element.querySelectorAll('button')]
  assert.equal(buttons.length, 2)
  assert.ok(buttons.every((button) => !button.disabled))
  await React.act(async () => buttons[1].click())
  assert.deepEqual(calls, ['extended'])
  for (const props of [{ preview: true, proposal: base }, { proposal: { ...base, expired: true } }]) {
    const readonly = await mount(t, View, props)
    assert.ok([...readonly.querySelectorAll('button')].every((button) => button.disabled))
  }
})

test('историческое расхождение не выдаёт текущий новый выбор за утверждённый; preview читает raw applied поля', async (t) => {
  const View = load('components/ProposalPageView.js').default
  const element = await mount(t, View, {
    preview: true,
    proposal: { ...base, selectedPackageId: 'extended', appliedAt: '2026-10-01', appliedPackageId: 'basic' },
  })
  const buttons = [...element.querySelectorAll('button')]
  assert.equal(buttons[0].textContent, 'Вариант утверждён')
  assert.notEqual(buttons[1].textContent, 'Вариант утверждён')
  assert.match(element.textContent, /утверждён/)
})

test('старая вкладка и отказ refresh не выдают неизвестную блокировку за утверждение', async (t) => {
  const Client = load('app/proposal/[publicId]/[token]/ProposalPublicClient.js').default
  const originalFetch = global.fetch
  let calls = 0
  global.fetch = async (_url, options = {}) => {
    calls++
    if (options.method === 'POST') return { ok: false, json: async () => ({ error: { code: 'selection_locked', message: 'Выбор закрыт' } }) }
    if (calls > 1) throw new Error('network down')
    return { ok: true, json: async () => ({ data: base }) }
  }
  t.after(() => { global.fetch = originalFetch })
  const element = await mount(t, Client, { publicId: 'test', token: 'test' })
  await React.act(async () => element.querySelectorAll('button')[1].click())
  assert.ok([...element.querySelectorAll('button')].every((b) => b.disabled))
  assert.match(element.querySelector('[role="status"]').textContent, /ожидает.*сверки/s)
  assert.doesNotMatch(element.textContent, /уже утверждён|Вариант утверждён/)
})

test('старая вкладка: POST conflict перечитывает настоящее публичное состояние и блокирует следующие нажатия', async (t) => {
  const Client = load('app/proposal/[publicId]/[token]/ProposalPublicClient.js').default
  const calls = []
  const originalFetch = global.fetch
  global.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' })
    if (options.method === 'POST') return {
      ok: false,
      json: async () => ({ error: { code: 'selection_locked', message: 'Выбор уже утверждён' } }),
    }
    return { ok: true, json: async () => ({ data: calls.length === 1 ? base : { ...base, selectionLocked: true, appliedPackageId: 'basic' } }) }
  }
  t.after(() => { global.fetch = originalFetch })
  const element = await mount(t, Client, { publicId: 'test', token: 'test' })
  await React.act(async () => element.querySelectorAll('button')[1].click())
  assert.deepEqual(calls.map((item) => item.method), ['GET', 'POST', 'GET'])
  const buttons = [...element.querySelectorAll('button')]
  assert.ok(buttons.every((button) => button.disabled))
  await React.act(async () => buttons[1].click())
  assert.equal(calls.length, 3)
  assert.match(element.textContent, /утверждён/)
})
