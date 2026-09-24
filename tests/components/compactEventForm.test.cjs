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
global.requestAnimationFrame = (fn) => setTimeout(fn, 0)
global.cancelAnimationFrame = clearTimeout
const { createRoot } = require('react-dom/client')
const cache = new Map()
const empty = []
let user = { role: 'dev' }
let compactProps
let saved = []
let confirmation
let transactionEventId
let renderTransactions = false
let eventFromQuery
const settings = {}
const atoms = {
  loggedUserAtom: 'user', siteSettingsAtom: 'settings', servicesAtom: empty,
  tariffsAtom: empty, modalsFuncAtom: { add(config) { confirmation = config }, event: {}, transaction: { add(id) { transactionEventId = id } } },
  itemsFuncAtom: { event: { set: async (payload) => { saved.push(payload); return { ...payload, _id: payload._id || 'saved' } } } },
}
const Box = ({ children }) => React.createElement('div', null, children)
const noop = () => {}
const mocks = {
  jotai: {
    useAtomValue: (atom) => atom === 'user' ? user : atom,
    useAtom: () => [settings, noop],
  },
  '@helpers/useEventsQuery': { useEventQuery: () => ({ data: eventFromQuery }), useEventsQuery: () => ({ data: undefined }) },
  '@helpers/useClientsQuery': { useClientsQuery: () => ({ data: empty }) },
  '@helpers/useTransactionsQuery': { useTransactionsQuery: () => ({ data: empty }), useDeleteTransactionMutation: () => ({}) },
  '@helpers/tariffAccess': { getUserTariffAccess: () => ({ allowDocuments: true }) },
  '@helpers/firstRunWizard.mjs': { shouldShowColleagueTransferControls: () => true },
  '@helpers/documentTemplates': { normalizeDocumentTemplatesFromSettings: () => empty },
  '@helpers/generateContractTemplate': { getContractTemplateVariablesMap: () => ({}) },
  '@helpers/generateActTemplate': { getActTemplateVariablesMap: () => ({}) },
  '@components/CompactEventForm': (props) => { compactProps = props; return React.createElement('main', { 'data-compact': true }, props.fields.description, renderTransactions ? props.fields.transactions : null) },
  '@components/AddIconButton': ({ onClick, title, disabled }) => React.createElement('button', { onClick, title, disabled }, '+'),
  '@components/Textarea': ({ label, value, onChange }) => React.createElement('textarea', { 'aria-label': label, value, onChange: (e) => onChange(e.target.value) }),
  '@fortawesome/react-fontawesome': { FontAwesomeIcon: () => null },
  '@helpers/CRUD': { postData: noop },
}
function load(file, customMocks = mocks) {
  const filename = path.resolve(file)
  const key = filename + (customMocks === mocks ? '' : ':component')
  if (cache.has(key)) return cache.get(key).exports
  const mod = { exports: {} }; cache.set(key, mod)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  })
  function resolve(id) {
    if (id in customMocks) return customMocks[id]
    if (id === '@state/atoms') return atoms
    if (id.startsWith('@state/')) return atoms[path.basename(id)]
    if (id.startsWith('@components/')) return Box
    if (id.startsWith('@helpers/')) {
      const target = `helpers/${id.slice(9)}`
      return load(path.extname(target) ? target : target + '.js')
    }
    if (id.startsWith('./') || id.startsWith('../')) {
      if (filename.includes(path.sep + 'modalsFunc' + path.sep)) return noop
      const target = path.resolve(path.dirname(filename), id)
      return load(path.extname(target) ? target : target + '.js')
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  return mod.exports
}
let eventFunc
let Compact
const componentMocks = {
  '@fortawesome/react-fontawesome': { FontAwesomeIcon: () => null },
  './InputWrapper': ({ label, children }) => React.createElement('div', null, label, children),
}
test.before(async () => { await loadBindings(); eventFunc = load('layouts/modals/modalsFunc/eventFunc.js').default; Compact = load('components/CompactEventForm.js', componentMocks).default })
test.after(() => dom.window.close())
async function mount(t, Component, props = {}) {
  const el = document.createElement('div'); document.body.append(el)
  const root = createRoot(el)
  await React.act(async () => root.render(React.createElement(Component, props)))
  t.after(async () => { await React.act(async () => root.unmount()); el.remove() })
  return { el, root }
}
function modalHarness(Modal) {
  return function Harness() {
    const [confirm, setConfirm] = React.useState(null)
    const setOnConfirmFunc = React.useCallback((fn) => setConfirm(() => fn), [])
    return React.createElement(React.Fragment, null,
      React.createElement(Modal, { closeModal: noop, setOnConfirmFunc, setOnDeclineFunc: noop, setOnCloseButtonFunc: noop, setOnShowOnCloseConfirmDialog: noop, setDisableConfirm: noop, setComponentInFooter: noop, setConfirmButtonName: noop, setTitle: noop }),
      confirm ? React.createElement('button', { onClick: confirm, 'data-save': true }, 'Сохранить') : null)
  }
}
test('compact form is the default for every role without a modal switch', async (t) => {
  for (const [role, custom] of [['user', undefined], ['admin', {}], [undefined, { eventFormVariant: 'unknown' }], ['dev', { eventFormVariant: 'compact' }]]) {
    settings.custom = custom
    user = role ? { role } : null
    const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft').Children))
    assert.equal(Boolean(el.querySelector('[data-compact]')), true)
    assert.equal(el.textContent.includes('Прежняя форма'), false)
  }
})
test('classic form follows the saved organization setting', async (t) => {
  user = { role: 'user' }
  settings.custom = { eventFormVariant: 'classic' }
  const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft', { initialEvent: { description: 'Договорённость из звонка', eventType: 'Праздник' } }).Children))
  assert.equal(el.querySelector('[data-compact]'), null)
  assert.equal(el.querySelector('textarea').value, 'Договорённость из звонка')
  assert.equal(el.textContent.includes('Компактная форма'), false)
  settings.custom = {}
})
test('regular user draft saves without services/date, confirmed work still validates both', async (t) => {
  user = { role: 'user' }; saved = []
  for (const status of ['draft', 'active']) {
    const { el } = await mount(t, modalHarness(eventFunc(null, false, status, { initialEvent: { clientId: 'client' } }).Children))
    await React.act(async () => el.querySelector('[data-save]').click())
    if (status === 'active') {
      assert.ok(compactProps.errors.eventDate)
      assert.ok(compactProps.errors.servicesIds)
    }
  }
  assert.equal(saved.length, 1)
  assert.equal(saved[0].status, 'draft')
  assert.equal(saved[0].eventDate, null)
  assert.deepEqual(saved[0].servicesIds, [])
})
test('draft still needs client and rejects an inverted date range, but type is optional', async (t) => {
  user = { role: 'dev' }; saved = []
  const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft', { initialEvent: { eventDate: '2026-10-03T12:00:00Z', dateEnd: '2026-10-02T12:00:00Z' } }).Children))
  await React.act(async () => el.querySelector('[data-save]').click())
  assert.ok(compactProps.errors.clientId)
  assert.equal(compactProps.errors.eventType, undefined)
  assert.ok(compactProps.errors.dateEnd)
  assert.equal(saved.length, 0)
})
const compactBase = {
  fields: { dates: React.createElement('input', { defaultValue: 'Дата для проверки' }) }, errors: {}, initialTab: 'Общие', isDraft: true, isNew: true,
  services: [], servicesIds: [], additionalEvents: [], otherContacts: [], documents: [], statusLabel: 'Заявка', address: {},
}

test('finance shortcut opens only the finance section', async (t) => {
  const { el } = await mount(t, Compact, { ...compactBase, initialTab: 'Финансы' })
  const openSections = [...el.querySelectorAll('details')]
    .filter((section) => section.open)
    .map((section) => section.querySelector('summary').textContent)
  assert.equal(openSections.length, 1)
  assert.match(openSections[0], /Финансы/)
})

test('draft transaction asks for confirmation and promotes the work item before opening transaction form', async (t) => {
  user = { role: 'user' }; saved = []; confirmation = null; transactionEventId = null; renderTransactions = true
  settings.custom = { primaryEntityTerminology: 'orders' }
  const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft', {
    initialEvent: { clientId: 'client', eventDate: '2026-10-03T12:00:00Z', servicesIds: ['service'] },
  }).Children))
  await React.act(async () => el.querySelector('[title="Добавить транзакцию"]').click())
  assert.match(confirmation.text, /статус заказа будет изменён на «Подтверждено»/)
  assert.equal(saved.length, 0)
  await React.act(async () => confirmation.onConfirm())
  assert.equal(saved.length, 1)
  assert.equal(saved[0].status, 'active')
  assert.equal(transactionEventId, 'saved')
  assert.equal(compactProps.status, 'active')
  renderTransactions = false; settings.custom = {}
})

test('draft transaction keeps draft status when required confirmation fields are missing', async (t) => {
  user = { role: 'user' }; saved = []; confirmation = null; transactionEventId = null; renderTransactions = true
  settings.custom = {}
  const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft', {
    initialEvent: { clientId: 'client' },
  }).Children))
  await React.act(async () => el.querySelector('[title="Добавить транзакцию"]').click())
  await React.act(async () => confirmation.onConfirm())
  assert.equal(saved.length, 0)
  assert.equal(transactionEventId, null)
  assert.equal(compactProps.status, 'draft')
  assert.ok(compactProps.errors.eventDate)
  assert.ok(compactProps.errors.servicesIds)
  renderTransactions = false
})

test('saved draft keeps its status when confirmation is cancelled and updates before transaction opens', async (t) => {
  user = { role: 'user' }; saved = []; confirmation = null; transactionEventId = null; renderTransactions = true
  settings.custom = { primaryEntityTerminology: 'events' }
  eventFromQuery = {
    _id: 'existing', status: 'draft', clientId: 'client',
    eventDate: '2026-10-03T12:00:00Z', servicesIds: ['service'],
  }
  const { el } = await mount(t, modalHarness(eventFunc('existing').Children))
  await React.act(async () => el.querySelector('[title="Добавить транзакцию"]').click())
  assert.match(confirmation.text, /статус мероприятия будет изменён на «Подтверждено»/)
  assert.equal(saved.length, 0)
  assert.equal(transactionEventId, null)
  await React.act(async () => confirmation.onConfirm())
  assert.equal(saved.length, 1)
  assert.equal(saved[0]._id, 'existing')
  assert.equal(saved[0].status, 'active')
  assert.equal(transactionEventId, 'existing')
  renderTransactions = false; eventFromQuery = undefined; settings.custom = {}
})

test('classic editor also offers draft transaction with confirmation', async (t) => {
  user = { role: 'user' }; saved = []; confirmation = null; transactionEventId = null
  settings.custom = { eventFormVariant: 'classic', primaryEntityTerminology: 'orders' }
  eventFromQuery = {
    _id: 'classic', status: 'draft', clientId: 'client',
    eventDate: '2026-10-03T12:00:00Z', servicesIds: ['service'],
  }
  const { el } = await mount(t, modalHarness(eventFunc('classic').Children))
  await React.act(async () => el.querySelector('[title="Добавить транзакцию"]').click())
  assert.match(confirmation.text, /статус заказа будет изменён на «Подтверждено»/)
  await React.act(async () => confirmation.onConfirm())
  assert.equal(saved[0].status, 'active')
  assert.equal(transactionEventId, 'classic')
  eventFromQuery = undefined; settings.custom = {}
})

test('date summary uses local days, uppercase weekdays and compact same-day time ranges', async (t) => {
  const cases = [
    ['2026-10-17T18:00:00', '2026-10-17T19:00:00', '17 окт. СБ 18:00 - 19:00'],
    ['2026-10-17T18:00:00', '2026-10-18T19:00:00', '17 окт. СБ 18:00 - 18 окт. ВС 19:00'],
    ['2026-10-17T18:00:00', null, '17 окт. СБ 18:00'],
    [null, null, 'Пока неизвестны'],
    ['2026-10-17T18:00:00', '2027-10-17T19:00:00', '17 окт. СБ 18:00 - 17 окт. 2027 ВС 19:00'],
  ]
  for (const [eventDate, dateEnd, expected] of cases) {
    const { el } = await mount(t, Compact, { ...compactBase, eventDate, dateEnd })
    const summary = [...el.querySelectorAll('summary')].find((item) => item.textContent.includes('Дата и время'))
    assert.equal(summary.textContent, `Дата и время${expected}`)
  }
})

test('selected service chips belong to the services section and remove the chosen service', async (t) => {
  let removed
  const { el } = await mount(t, Compact, {
    ...compactBase, services: [{ _id: 'service-1', title: 'Ведущий' }], servicesIds: ['service-1'],
    onRemoveService: (id) => { removed = id },
  })
  const chip = el.querySelector('[aria-label="Убрать услугу «Ведущий»"]')
  const section = chip.closest('details')
  assert.ok(section.querySelector('summary').textContent.includes('Услуги и тип события'))
  assert.equal(section.open, false)
  section.open = true
  await React.act(async () => chip.click())
  assert.equal(removed, 'service-1')
})

test('client section keeps request and contacts together and opens on client validation error', async (t) => {
  const props = {
    ...compactBase,
    fields: {
      description: React.createElement('textarea', { 'aria-label': 'Запрос клиента' }),
      contacts: React.createElement('div', { 'data-contacts': true }, 'Прочие контакты'),
      documents: React.createElement('div', { 'data-documents': true }, 'Документы'),
    },
  }
  const { el, root } = await mount(t, Compact, props)
  const section = el.querySelector('textarea').closest('details')
  assert.ok(section.querySelector('summary').textContent.includes('Клиент и прочие контакты'))
  assert.equal(section.open, false)
  assert.ok(section.querySelector('[data-contacts]'))
  assert.equal(section.querySelector('[data-documents]'), null)
  await React.act(async () => root.render(React.createElement(Compact, { ...props, errors: { clientId: 'Выберите клиента' }, validationAttempt: 1 })))
  assert.equal(section.open, true)
})

test('service selection stages changes until apply and allows clearing all services', async (t) => {
  let pickerProps
  let applied
  const selectServices = load('layouts/modals/modalsFunc/selectEventServicesFunc.js', {
    ...mocks,
    '@components/ServiceMultiSelect': (props) => { pickerProps = props; return null },
  }).default
  const modal = selectServices(['original'], (ids) => { applied = ids })
  const { el } = await mount(t, modalHarness(modal.Children))
  assert.deepEqual(pickerProps.value, ['original'])
  await React.act(async () => pickerProps.onChange(['new']))
  assert.equal(applied, undefined)
  await React.act(async () => pickerProps.onChange([]))
  await React.act(async () => el.querySelector('[data-save]').click())
  assert.deepEqual(applied, [])
})

test('finance summary distinguishes actual payments, costs and expected deposit', async (t) => {
  const props = { ...compactBase, contractSum: 30000, paidAmount: 10000, expenseAmount: 2000 }
  const { el, root } = await mount(t, Compact, props)
  const summary = () => [...el.querySelectorAll('summary')].find((item) => item.textContent.includes('Финансы'))
  assert.match(summary().textContent.replace(/\s/g, ''), /Оплачено:10000₽•Затраты:2000₽•Договорнаясумма:30000₽/)
  assert.ok(summary().querySelector('.whitespace-normal'))
  await React.act(async () => root.render(React.createElement(Compact, { ...props, paidAmount: 0, expenseAmount: 0, waitDeposit: true, depositExpectedAmount: 5000 })))
  assert.match(summary().textContent, /Оплачено: 0 ₽/)
  assert.equal(summary().textContent.includes('Затраты:'), false)
  assert.match(summary().textContent.replace(/\s/g, ''), /ждёмзадаток5000₽/)
})
test('collapsed sections retain field state and expose summaries; invalid dates open automatically', async (t) => {
  const props = { ...compactBase, contractSum: 25000, waitDeposit: true, depositExpectedAmount: 5000 }
  const { el, root } = await mount(t, Compact, props)
  const section = [...el.querySelectorAll('details')].find((item) => item.textContent.includes('Дата и время'))
  assert.equal(section.open, false)
  assert.match(el.textContent, /25.*000.*₽/)
  const field = section.querySelector('input'); field.value = 'Изменённая дата'
  section.open = true; section.open = false
  assert.equal(field.value, 'Изменённая дата')
  await React.act(async () => root.render(React.createElement(Compact, { ...props, errors: { dateEnd: 'Неверный интервал' }, validationAttempt: 1 })))
  assert.equal(section.open, true)
})

test('regular users can save a compact draft without services and date', async (t) => {
  user = { role: 'user' }; saved = []
  const { el } = await mount(t, modalHarness(eventFunc(null, false, 'draft', { initialEvent: { clientId: 'client', eventType: 'Праздник' } }).Children))
  await React.act(async () => el.querySelector('[data-save]').click())
  assert.equal(saved.length, 1)
  assert.ok(el.querySelector('[data-compact]'))
})
test('retrying validation reopens a manually collapsed invalid section', async (t) => {
  const props = { ...compactBase, errors: { eventType: 'Выберите тип' }, validationAttempt: 1 }
  const { el, root } = await mount(t, Compact, props)
  const section = el.querySelector('[data-invalid="true"] details')
  assert.equal(section.open, true)
  section.open = false
  await React.act(async () => {
    root.render(React.createElement(Compact, { ...props, validationAttempt: 2 }))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  assert.equal(section.open, true)
})
