const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { atom, Provider, createStore } = require('jotai')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/cabinet/eventsUpcoming',
})
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
const modalsAtom = atom([])
// История не является предметом теста; исключаем отложенный popstate между случаями.
dom.window.history.back = () => {}
let ModalsPortal

const elements = () => [document.documentElement, document.body]
const styles = () => elements().map((element) => element.style.cssText)
const expectLocked = () => {
  for (const element of elements()) {
    assert.equal(
      element.style.getPropertyValue('overscroll-behavior-y'),
      'none'
    )
    assert.equal(element.style.getPropertyValue('overflow'), 'hidden')
  }
}

test.before(async () => {
  await loadBindings()
  const filename = path.resolve('layouts/modals/ModalsPortal.js')
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === '@state/atoms/modalsAtom') return modalsAtom
      if (id === './Modal')
        return () => React.createElement('div', null, 'Окно')
      return require(id)
    },
    loaded,
    loaded.exports
  )
  ModalsPortal = loaded.exports.default
})

test.after(() => dom.window.close())
test.beforeEach(() => {
  for (const element of elements()) element.removeAttribute('style')
})

const mount = async ({ initial = [], strict = false } = {}) => {
  const store = createStore()
  store.set(modalsAtom, initial)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const portal = React.createElement(
    Provider,
    { store },
    React.createElement(ModalsPortal)
  )
  await React.act(async () => {
    root.render(
      strict ? React.createElement(React.StrictMode, null, portal) : portal
    )
  })
  return {
    update: async (modals) =>
      React.act(async () => store.set(modalsAtom, modals)),
    unmount: async () => {
      await React.act(async () => root.unmount())
      container.remove()
    },
  }
}
const first = { id: 'first', props: {} }
const second = { id: 'second', props: {} }

test('без окон прокрутка и жест обновления страницы не меняются', async () => {
  const view = await mount()
  try {
    assert.deepEqual(styles(), ['', ''])
  } finally {
    await view.unmount()
  }
})

test('открытие окна отключает обновление жестом и прокрутку фона', async () => {
  const view = await mount()
  try {
    await view.update([first])
    expectLocked()
  } finally {
    await view.unmount()
  }
})

test('вложенное окно не снимает блокировку; последнее восстанавливает исходные свойства', async () => {
  document.documentElement.style.setProperty('overflow', 'auto', 'important')
  document.documentElement.style.setProperty('overscroll-behavior-y', 'contain')
  document.body.style.setProperty('overflow', 'scroll')
  document.body.style.setProperty('overscroll-behavior-y', 'auto', 'important')
  document.body.style.setProperty('color', 'red')
  const original = styles()
  const view = await mount()
  try {
    await view.update([first])
    expectLocked()
    await view.update([first, second])
    expectLocked()
    await view.update([first])
    expectLocked()
    await view.update([])
    assert.deepEqual(styles(), original)
  } finally {
    await view.unmount()
  }
})

test('размонтирование с открытым окном удаляет блокировку и сохраняет соседние стили', async () => {
  document.body.style.setProperty('color', 'red')
  const view = await mount({ initial: [first] })
  try {
    expectLocked()
    document.body.style.setProperty('background-color', 'blue')
  } finally {
    await view.unmount()
  }
  for (const element of elements()) {
    assert.equal(element.style.getPropertyValue('overflow'), '')
    assert.equal(element.style.getPropertyValue('overscroll-behavior-y'), '')
  }
  assert.equal(document.body.style.color, 'red')
  assert.equal(document.body.style.backgroundColor, 'blue')
})

test('повторный цикл эффектов в строгом режиме и повторное открытие не теряют исходные значения', async () => {
  document.body.style.setProperty('overflow', 'auto')
  const original = styles()
  const view = await mount({ initial: [first], strict: true })
  try {
    expectLocked()
    await view.update([])
    assert.deepEqual(styles(), original)
    await view.update([first])
    expectLocked()
    await view.update([])
    assert.deepEqual(styles(), original)
  } finally {
    await view.unmount()
  }
})
