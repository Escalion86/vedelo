const { setTimeout } = require('node:timers')
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
const { document } = window
global.window = window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = require('react-dom/client')
let AddressSuggestField

test.before(async () => {
  await loadBindings()
  const filename = path.resolve('components/AddressSuggestField.js')
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  const resolve = (id) => {
    if (id === '@fortawesome/react-fontawesome')
      return { FontAwesomeIcon: () => null }
    if (id === '@helpers/addressPool')
      return {
        formatAddressPoolShort: (address) => address?.street || address?.comment || '',
      }
    if (id === './Notice')
      return ({ children, tone, ...props }) => React.createElement('div', props, children)
    if (id === './AppButton')
      return ({ children, variant, size, ...props }) => React.createElement('button', { type: 'button', ...props }, children)
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(
    resolve,
    compiledModule,
    compiledModule.exports
  )
  AddressSuggestField = compiledModule.exports.default
})
test.after(() => dom.window.close())

const waitForDebounce = () =>
  React.act(() => new Promise((resolve) => setTimeout(resolve, 650)))

async function setup(t, initialProps = {}, controlled = false) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const requests = []
  const originalFetch = global.fetch
  global.fetch = (url, options) =>
    new Promise((resolve) => {
      requests.push({
        body: JSON.parse(options.body),
        signal: options.signal,
        resolve,
      })
    })
  t.after(async () => {
    await React.act(() => root.unmount())
    container.remove()
    global.fetch = originalFetch
  })
  let props = { poolAddresses: [], ...initialProps }
  const ControlledField = (fieldProps) => {
    const [address, setAddress] = React.useState(fieldProps.address)
    return React.createElement(AddressSuggestField, {
      ...fieldProps,
      address,
      onChange: (value) => {
        setAddress(value)
        fieldProps.onChange?.(value)
      },
    })
  }
  const render = async (next = {}) => {
    props = { ...props, ...next }
    await React.act(() =>
      root.render(React.createElement(controlled ? ControlledField : AddressSuggestField, props))
    )
  }
  await render()
  const type = async (value) => {
    const input = container.querySelector('input')
    await React.act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  }
  const respond = async (index, data) => {
    await React.act(async () =>
      requests[index].resolve({
        ok: true,
        json: async () => ({ success: true, data }),
      })
    )
  }
  return { container, requests, render, type, respond }
}

test('changing or clearing the query aborts stale responses, including during debounce', async (t) => {
  const ui = await setup(t)
  await ui.type('Ленина')
  await waitForDebounce()
  assert.equal(ui.requests.length, 1)
  await ui.type('Мира')
  assert.equal(ui.requests[0].signal.aborted, true)
  await ui.respond(0, { suggestions: [{ label: 'Старый адрес', address: {} }] })
  assert.doesNotMatch(ui.container.textContent, /Старый адрес/)
  await waitForDebounce()
  await ui.type('')
  assert.equal(ui.requests[1].signal.aborted, true)
  await ui.respond(1, {
    suggestions: [{ label: 'Поздний адрес', address: {} }],
  })
  assert.doesNotMatch(ui.container.textContent, /Поздний адрес|Поиск…/)
})

test('the same query in another town fetches new suggestions and exact cache restores the right town', async (t) => {
  const ui = await setup(t, { defaultTown: 'Москва' })
  await ui.type('Ленина')
  await waitForDebounce()
  await ui.respond(0, {
    suggestions: [{ label: 'Москва, Ленина', address: {} }],
  })
  await ui.render({ defaultTown: 'Красноярск' })
  assert.doesNotMatch(ui.container.textContent, /Москва, Ленина/)
  await waitForDebounce()
  assert.equal(ui.requests[1].body.town, 'Красноярск')
  await ui.respond(1, {
    suggestions: [{ label: 'Красноярск, Ленина', address: {} }],
  })
  await ui.render({ defaultTown: 'Москва' })
  assert.match(ui.container.textContent, /Москва, Ленина/)
  assert.doesNotMatch(ui.container.textContent, /Красноярск, Ленина|Поиск…/)
  assert.equal(ui.requests.length, 2)
})

test('external address edits cancel coordinate lookup instead of overwriting the edit', async (t) => {
  const changes = []
  const ui = await setup(t, { onChange: (value) => changes.push(value) })
  await ui.type('Ленина')
  await waitForDebounce()
  await ui.respond(0, {
    suggestions: [{ label: 'Ленина 1', address: { street: 'Ленина' } }],
  })
  const button = [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Ленина 1'
  )
  await React.act(() => button.click())
  assert.equal(ui.requests[1].body.mode, 'select')
  await ui.render({ address: { street: 'Ручной адрес' } })
  assert.equal(ui.requests[1].signal.aborted, true)
  await ui.respond(1, { selected: { address: { street: 'Ленина' } } })
  assert.deepEqual(changes, [{ street: 'Ленина' }])
  assert.match(ui.container.textContent, /Ручной адрес/)
})

test('selected address is shown immediately while coordinates load and survives an empty response', async (t) => {
  const changes = []
  const ui = await setup(t, { onChange: (value) => changes.push(value) }, true)
  await ui.type('Ленина')
  await waitForDebounce()
  await ui.respond(0, {
    suggestions: [{ label: 'Ленина 1', address: { street: 'Ленина', house: '1' } }],
  })
  await React.act(() => [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Ленина 1'
  ).click())
  assert.match(ui.container.textContent, /Ленина/)
  assert.equal(ui.container.querySelector('input'), null)
  assert.equal(ui.requests[1].signal.aborted, false)
  assert.deepEqual(changes, [{ street: 'Ленина', house: '1' }])
  await ui.respond(1, { selected: null })
  assert.match(ui.container.textContent, /Ленина/)
  assert.equal(changes.length, 1)
})

test('coordinate refinement still updates the selected address after the immediate form update', async (t) => {
  const changes = []
  const ui = await setup(t, { onChange: (value) => changes.push(value) }, true)
  await ui.type('Ленина')
  await waitForDebounce()
  await ui.respond(0, {
    suggestions: [{ label: 'Ленина 1', address: { street: 'Ленина', house: '1' } }],
  })
  await React.act(() => [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Ленина 1'
  ).click())
  await ui.respond(1, { selected: { address: { latitude: '56', longitude: '92' } } })
  assert.deepEqual(changes[1], { street: 'Ленина', house: '1', latitude: '56', longitude: '92' })
  assert.match(ui.container.textContent, /Ленина/)
})

test('pool options stay open when focused with the keyboard and support click activation', async (t) => {
  const changes = []
  const address = { street: 'Мой адрес' }
  const ui = await setup(t, { poolAddresses: [address], onChange: (value) => changes.push(value) })
  await ui.type('')
  const button = [...ui.container.querySelectorAll('button')].find((item) => item.textContent === 'Мой адрес')
  await React.act(() => button.focus())
  await React.act(() => new Promise((resolve) => setTimeout(resolve, 180)))
  assert.equal(button.isConnected, true)
  assert.equal(document.activeElement, button)
  await React.act(() => button.click())
  assert.deepEqual(changes, [address])
})

test('editing keeps the current address in the search field while clearing removes it', async (t) => {
  const changes = []
  const address = { street: 'Ленина' }
  const ui = await setup(t, {
    address,
    poolAddresses: [address],
    onChange: (value) => changes.push(value),
  }, true)
  await React.act(() => ui.container.querySelector('[title="Изменить адрес"]').click())
  assert.equal(ui.container.querySelector('input').value, 'Ленина')
  assert.deepEqual(changes, [])
  await React.act(() => [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Ленина'
  ).click())
  await React.act(() => ui.container.querySelector('[title="Очистить адрес"]').click())
  assert.equal(ui.container.querySelector('input').value, '')
  assert.deepEqual(changes, [address, null])
})

test('unconfirmed text stays visible after blur and can be explicitly accepted without suggestions', async (t) => {
  const changes = []
  const ui = await setup(t, { onChange: (value) => changes.push(value) }, true)
  await ui.type('  Ресторан у озера  ')
  assert.doesNotMatch(ui.container.textContent, /Текст ещё не подтверждён/)
  await React.act(() => ui.container.querySelector('input').blur())
  assert.match(ui.container.textContent, /Текст ещё не подтверждён/)
  await React.act(() => ui.container.querySelector('input').focus())
  assert.doesNotMatch(ui.container.textContent, /Текст ещё не подтверждён/)
  await React.act(() => ui.container.querySelector('input').blur())
  assert.deepEqual(changes, [])
  await React.act(() => [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Использовать введённый текст'
  ).click())
  assert.deepEqual(changes, [{ comment: 'Ресторан у озера' }])
  assert.match(ui.container.textContent, /Ресторан у озера/)
  assert.doesNotMatch(ui.container.textContent, /Текст ещё не подтверждён/)
})

test('confirming replacement text removes obsolete address details and coordinates', async (t) => {
  const changes = []
  const ui = await setup(t, {
    address: { street: 'Ленина', house: '1', latitude: '56', longitude: '92' },
    onChange: (value) => changes.push(value),
  }, true)
  await React.act(() => ui.container.querySelector('[title="Изменить адрес"]').click())
  assert.doesNotMatch(ui.container.textContent, /Текст ещё не подтверждён/)
  await ui.type('Другая площадка')
  assert.doesNotMatch(ui.container.textContent, /Текст ещё не подтверждён/)
  await React.act(() => ui.container.querySelector('input').blur())
  assert.match(ui.container.textContent, /сохранится прежний адрес/)
  await React.act(() => [...ui.container.querySelectorAll('button')].find(
    (item) => item.textContent === 'Использовать введённый текст'
  ).click())
  assert.deepEqual(changes, [{ comment: 'Другая площадка' }])
})
