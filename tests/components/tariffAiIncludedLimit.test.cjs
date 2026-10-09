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
const { act } = React
const { createRoot } = require('react-dom/client')

const DEFAULT_TARIFF = Object.freeze({
  title: '',
  eventsPerMonth: 0,
  price: 0,
  allowCalendarSync: false,
  allowStatistics: false,
  allowDocuments: false,
  allowClientReviews: false,
  allowProposals: false,
  allowTelephony: false,
  allowAi: false,
  aiIncludedRubPerMonth: 0,
  allowAvitoIntegration: false,
  allowVkIntegration: false,
  allowTelegramIntegration: false,
  allowPublicLeadApi: false,
  hidden: false,
})

// Управляемые мок-зависимости модалки тарифа.
let currentTariff = null
const setCalls = []

const mocks = {
  jotai: { useAtomValue: (value) => value },
  '@helpers/constants': { DEFAULT_TARIFF },
  '@helpers/useErrors': {
    __esModule: true,
    default: () => [{}, () => false, null, () => {}],
  },
  '@components/ErrorsList': { __esModule: true, default: () => null },
  '@components/FormWrapper': {
    __esModule: true,
    default: ({ children }) => React.createElement('div', null, children),
  },
  '@components/Input': {
    __esModule: true,
    default: ({ label, value, onChange, help }) =>
      React.createElement(
        'label',
        null,
        label,
        React.createElement('input', {
          'aria-label': label,
          value: value ?? '',
          onChange: (event) => onChange?.(event.target.value),
        }),
        help ? React.createElement('span', { 'data-help': label }, help) : null
      ),
  },
  '@components/IconCheckBox': {
    __esModule: true,
    default: ({ checked, onClick, label }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'aria-label': label,
          'aria-checked': checked ? 'true' : 'false',
          onClick,
        },
        label
      ),
  },
  '@state/atoms/itemsFuncAtom': {
    __esModule: true,
    default: { tariff: { set: (...args) => setCalls.push(args) } },
  },
  '@state/selectors/tariffSelector': {
    __esModule: true,
    default: () => currentTariff,
  },
}

const loadModal = () => {
  const filename = path.resolve('layouts/modals/modalsFunc/tariffFunc.js')
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
      if (id in mocks) return mocks[id]
      return require(id)
    },
    loaded,
    loaded.exports
  )
  return loaded.exports.default
}

test.before(async () => {
  await loadBindings()
})

test.after(() => dom.window.close())

const mountModal = async (tariff) => {
  currentTariff = tariff
  setCalls.length = 0
  const TariffModal = loadModal()().Children
  const state = { confirm: null, disables: [] }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(TariffModal, {
        closeModal: () => {},
        setOnConfirmFunc: (fn) => {
          state.confirm = fn
        },
        setOnShowOnCloseConfirmDialog: () => {},
        setDisableConfirm: (value) => {
          state.disables.push(value)
        },
      })
    )
  })
  return {
    state,
    container,
    label: (name) => container.querySelector(`[aria-label="${name}"]`),
    hasText: (text) =>
      [...container.querySelectorAll('button, span, label')].some((node) =>
        node.textContent.includes(text)
      ),
    click: async (name) => {
      const node = container.querySelector(`[aria-label="${name}"]`)
      assert.ok(node, `Элемент «${name}» должен существовать`)
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    type: async (name, value) => {
      const input = container.querySelector(`[aria-label="${name}"]`)
      assert.ok(input, `Поле «${name}» должно существовать`)
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          'value'
        ).set
        setter.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
    },
    confirm: async () => {
      assert.ok(state.confirm, 'Подтверждение должно быть доступно')
      await act(async () => {
        await state.confirm()
      })
    },
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

const AI_FIELD = 'ИИ включён на сумму (₽/мес)'

test('тариф с ИИ: поле лимита появляется под флагом и сохраняет введённую сумму', async () => {
  const view = await mountModal({
    _id: 'pro',
    ...DEFAULT_TARIFF,
    title: 'Профи',
    price: 990,
    allowAi: true,
    aiIncludedRubPerMonth: 500,
  })

  const field = view.label(AI_FIELD)
  assert.ok(field, 'Поле лимита должно быть видно при включённом ИИ')
  assert.equal(field.value, '500')
  assert.ok(view.hasText('себестоимости ИИ'), 'Подсказка о лимите должна быть видна')

  await view.type(AI_FIELD, '700')
  await view.confirm()

  assert.equal(setCalls.length, 1)
  const [payload] = setCalls[0]
  assert.equal(payload.aiIncludedRubPerMonth, 700)
  assert.equal(payload.allowAi, true)
  assert.equal(payload.title, 'Профи')

  await view.unmount()
})

test('тариф без ИИ: поля лимита нет', async () => {
  const view = await mountModal({
    _id: 'base',
    ...DEFAULT_TARIFF,
    title: 'Старт',
    allowAi: false,
    aiIncludedRubPerMonth: 0,
  })

  assert.equal(view.label(AI_FIELD), null)
  await view.unmount()
})

test('снятие флага ИИ обнуляет лимит и скрывает поле', async () => {
  const view = await mountModal({
    _id: 'pro',
    ...DEFAULT_TARIFF,
    title: 'Профи',
    allowAi: true,
    aiIncludedRubPerMonth: 500,
  })

  assert.ok(view.label(AI_FIELD))
  await view.click('ИИ-возможности')
  assert.equal(view.label(AI_FIELD), null)
  await view.confirm()

  const [payload] = setCalls.at(-1)
  assert.equal(payload.allowAi, false)
  assert.equal(payload.aiIncludedRubPerMonth, 0)

  await view.unmount()
})

test('тариф с ИИ без лимита: сохраняется ноль', async () => {
  const view = await mountModal({
    _id: 'pro',
    ...DEFAULT_TARIFF,
    title: 'Профи',
    allowAi: true,
    aiIncludedRubPerMonth: 0,
  })

  const field = view.label(AI_FIELD)
  assert.ok(field)
  assert.equal(field.value, '0')

  await view.type(AI_FIELD, '250')
  await view.confirm()

  const [payload] = setCalls.at(-1)
  assert.equal(payload.aiIncludedRubPerMonth, 250)

  await view.unmount()
})
