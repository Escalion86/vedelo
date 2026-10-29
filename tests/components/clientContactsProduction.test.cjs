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
let client
let saved
let errors
const emptyList = []
const items = {
  client: {
    set: async (value) => {
      saved = value
      return value
    },
  },
}
const Box = ({ children }) => React.createElement('div', null, children)
const Input = ({ label, value, onChange }) =>
  React.createElement('input', {
    'aria-label': label,
    value: value ?? '',
    onChange: (event) => onChange(event.target.value),
  })
const mocks = {
  jotai: { useAtomValue: (value) => value },
  '@state/atoms/itemsFuncAtom': items,
  '@state/atoms/loggedUserAtom': {role:'user'},
  '@state/atoms/siteSettingsAtom': {},
  '@state/atoms/tariffsAtom': [],
  '@components/FieldHelp': () => null,
  '@state/atoms': { modalsFuncAtom: {} },
  '@helpers/useClientsQuery': {
    useClientsQuery: () => ({ data: emptyList }),
    useClientQuery: () => ({ data: client }),
  },
  '@helpers/useErrors': () => [
    {},
    () => false,
    (value) => errors.push(value),
    () => {},
  ],
  '@fortawesome/react-fontawesome': { FontAwesomeIcon: () => null },
}
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const filename = path.resolve(file)
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
    if (id in mocks) return mocks[id]
    if (id === '@components/Input') return Input
    if (id === '@components/PhoneInput') return (props) => React.createElement(Input, {
      ...props, onChange: (value) => props.onChange(value ? Number(value) : null),
    })
    if (id.startsWith('@components/')) return Box
    if (id.startsWith('@helpers/') && id.endsWith('.json')) return require(path.resolve(`helpers/${id.slice(9)}`))
    if (id.startsWith('@helpers/')) return load(`helpers/${id.slice(9)}${path.extname(id) ? '' : '.js'}`)
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id))
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(
    resolve,
    compiledModule,
    compiledModule.exports
  )
  cache.set(file, compiledModule.exports)
  return compiledModule.exports
}
test.before(async () => loadBindings())
test.after(() => dom.window.close())

for (const contact of ['Telegram', 'VK', 'none', 'existing email', 'confirmed Telegram phone', 'Telegram phone only', 'invalid Telegram phone', 'clear Telegram phone', 'paste Telegram phone', 'paste Telegram phone with username']) {
  test(`client save with ${contact} and without phone/WhatsApp`, async () => {
    client =
      contact === 'existing email' ? { email: 'client@example.com' } : null
    if (contact === 'confirmed Telegram phone' || contact === 'clear Telegram phone')
      client = { telegramPhone: 79991234567, telegram: 'existing_handle' }
    if (contact === 'paste Telegram phone with username') client = { telegram: 'existing_handle' }
    saved = null
    errors = []
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let confirm
    const noop = () => {}
    const { Children } = load(
      'layouts/modals/modalsFunc/clientFunc.js'
    ).default()
    try {
      await React.act(() =>
        root.render(
          React.createElement(Children, {
            closeModal: noop,
            setOnConfirmFunc: (fn) => {
              confirm = fn
            },
            setOnShowOnCloseConfirmDialog: noop,
            setDisableConfirm: noop,
          })
        )
      )
      const type = async (label, value) =>
        React.act(() => {
          const input = container.querySelector(`input[aria-label="${label}"]`)
          Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          ).set.call(input, value)
          input.dispatchEvent(new window.Event('input', { bubbles: true }))
        })
      await type('ФИО', 'Иван Петров')
      if (contact === 'confirmed Telegram phone')
        assert.equal(container.querySelector('input[aria-label="Telegram — телефон"]').value, '79991234567')
      if (contact === 'Telegram phone only') await type('Telegram — телефон', '79997654321')
      if (contact === 'invalid Telegram phone') await type('Telegram — телефон', '7999')
      if (contact === 'clear Telegram phone') await type('Telegram — телефон', '')
      if (contact.startsWith('paste Telegram phone')) await type('Telegram', '+7(913) 833-56-01')
      if (contact === 'Telegram' || contact === 'VK')
        await type(contact, 'client_contact')
      assert.equal(typeof confirm, 'function')
      await React.act(async () => confirm())
      if (contact === 'invalid Telegram phone') {
        assert.equal(saved, null)
        assert.match(errors[0].telegramPhone, /Некорректно/)
      } else if (contact === 'none') {
        assert.equal(saved, null)
        assert.match(errors[0].phone, /Укажите хотя бы один контакт/)
      } else {
        assert.equal(saved.firstName, 'Иван Петров')
        assert.equal(saved.phone, null)
        assert.deepEqual(errors, [])
        if (contact === 'confirmed Telegram phone') {
          assert.equal(saved.telegramPhone, 79991234567)
          assert.equal(saved.telegram, 'existing_handle')
        }
        if (contact === 'Telegram phone only') assert.equal(String(saved.telegramPhone), '79997654321')
        if (contact === 'clear Telegram phone') assert.equal(saved.telegramPhone, null)
        if (contact.startsWith('paste Telegram phone')) {
          assert.equal(saved.telegramPhone, 79138335601)
          assert.equal(saved.telegram, contact.endsWith('with username') ? 'existing_handle' : '')
        }
      }
    } finally {
      await React.act(() => root.unmount())
      container.remove()
    }
  })
}
