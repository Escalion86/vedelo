const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const React = require('react')
const { JSDOM } = require('jsdom')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
global.window = dom.window
global.document = dom.window.document
global.IS_REACT_ACT_ENVIRONMENT = true

const { createRoot } = require('react-dom/client')
let EventStatusPicker

const compile = (file, resolve = require) => {
  const filename = path.resolve(file)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  return mod.exports
}

test.before(async () => {
  await loadBindings()
  const statuses = [
    { value: 'draft', name: 'Заявка', icon: 'clock' },
    { value: 'active', name: 'Подтверждено', icon: 'play' },
    { value: 'canceled', name: 'Отменено', icon: 'ban' },
    { value: 'closed', name: 'Закрыто', icon: 'lock' },
  ]
  const resolve = (id) => {
    if (id === '@components/InputWrapper') {
      return ({ label, children }) =>
        React.createElement('section', null, label, children)
    }
    if (id === '@helpers/constants') return { EVENT_STATUSES: statuses }
    if (id === '@fortawesome/free-solid-svg-icons/faCheck') {
      return { faCheck: 'check' }
    }
    if (id === '@fortawesome/react-fontawesome') {
      return {
        FontAwesomeIcon: ({ icon }) =>
          React.createElement('span', { 'data-icon': icon }),
      }
    }
    return require(id)
  }

  EventStatusPicker = compile(
    'components/ValuePicker/EventStatusPicker.js',
    resolve
  ).default
})

test.after(() => dom.window.close())

test('shows four semantic statuses and changes the selected value', async (t) => {
  const selected = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await React.act(() =>
    root.render(
      React.createElement(EventStatusPicker, {
        status: 'draft',
        onChange: (value) => selected.push(value),
      })
    )
  )
  t.after(async () => {
    await React.act(() => root.unmount())
    container.remove()
  })

  const group = container.querySelector('[role="radiogroup"]')
  const buttons = [...container.querySelectorAll('[role="radio"]')]
  assert.ok(group)
  assert.equal(buttons.length, 4)
  assert.equal(buttons[0].getAttribute('aria-checked'), 'true')
  assert.equal(buttons[1].getAttribute('aria-checked'), 'false')
  assert.match(container.textContent, /Без подтверждения/)
  assert.match(container.textContent, /Заказ подтверждён/)

  await React.act(() => buttons[2].click())
  assert.deepEqual(selected, ['canceled'])
})

test('keeps a blocked status disabled and exposes the reason', async (t) => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const reason = 'Закрыть можно только после завершения мероприятия'

  await React.act(() =>
    root.render(
      React.createElement(EventStatusPicker, {
        status: 'active',
        disabledValues: ['closed'],
        disabledReasons: { closed: reason },
      })
    )
  )
  t.after(async () => {
    await React.act(() => root.unmount())
    container.remove()
  })

  const closedButton = [...container.querySelectorAll('[role="radio"]')].find(
    (button) => button.textContent.includes('Закрыто')
  )
  assert.equal(closedButton.disabled, true)
  assert.equal(closedButton.title, reason)
  assert.equal(closedButton.getAttribute('aria-label'), `Закрыто. ${reason}`)
})
