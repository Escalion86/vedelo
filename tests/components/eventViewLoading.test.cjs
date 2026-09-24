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

let queryState = { data: undefined, isPending: true, isError: false }
const emptyList = []
const atoms = {
  servicesAtom: emptyList,
  siteSettingsAtom: {},
  loggedUserAtom: { role: 'user' },
  windowDimensionsTailwindSelector: 'phoneV',
  modalsFuncAtom: { event: {} },
  itemsFuncAtom: {},
}
const cache = new Map()
const Box = ({ children }) => React.createElement('div', null, children)
const eventTerms = {
  mode: 'events',
  label: 'мероприятие',
  labelCapitalized: 'Мероприятие',
  genitive: 'мероприятия',
  dative: 'мероприятию',
  accusative: 'мероприятие',
  plural: 'мероприятия',
  pluralCapitalized: 'Мероприятия',
  pluralGenitive: 'мероприятий',
}
const mocks = {
  jotai: { useAtomValue: (value) => React.useMemo(() => value, [value]) },
  '@helpers/useEventsQuery': { useEventQuery: () => queryState },
  '@helpers/useClientsQuery': { useClientsQuery: () => ({ data: emptyList }) },
  '@helpers/useTransactionsQuery': { useTransactionsQuery: () => ({ data: emptyList }) },
  '@helpers/useCopyToClipboard': (value) => React.useCallback(() => value, [value]),
  '@helpers/useWorkItemTerminology': () => eventTerms,
  '@helpers/switchImpersonation': async () => {},
  '@helpers/workItemTerminology.mjs': {
    resolveWorkItemTerminology: () => eventTerms,
  },
  '@fortawesome/react-fontawesome': { FontAwesomeIcon: () => null },
}

// Compile the real JSX without a dev server or access to any CRM account.
function loadComponent(file) {
  const filename = path.resolve(file)
  if (cache.has(filename)) return cache.get(filename).exports
  const compiledModule = { exports: {} }
  cache.set(filename, compiledModule)
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
    if (id === '@state/atoms') return atoms
    if (id.startsWith('@state/')) return atoms[path.basename(id)]
    if (id === '@components/CardButtons') return loadComponent('components/CardButtons.js')
    if (id === '@components/Notice') return loadComponent('components/Notice.js')
    if (id.startsWith('@components/') || id === 'next/image') return Box
    if (id.startsWith('@helpers/')) {
      const helperFile = `helpers/${id.slice(9)}`
      return loadComponent(path.extname(helperFile) ? helperFile : `${helperFile}.js`)
    }
    if (id === './CardButton') {
      return ({ tooltipText, onClick }) => React.createElement('button', { onClick }, tooltipText)
    }
    if (id === './DropDown') {
      return ({ trigger, children }) => React.createElement('div', null, trigger, children)
    }
    if (id.startsWith('./')) {
      if (filename.startsWith(path.resolve('helpers') + path.sep)) {
        const helperFile = path.resolve(path.dirname(filename), id)
        return loadComponent(path.extname(helperFile) ? helperFile : `${helperFile}.js`)
      }
      return Box
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(resolve, compiledModule, compiledModule.exports)
  return compiledModule.exports
}

test.before(async () => loadBindings())
test.after(() => dom.window.close())

test('CardButtons survives missing → loaded → removed items without changing hook order', async () => {
  const CardButtons = loadComponent('components/CardButtons.js').default
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    for (const item of [undefined, null, {}, { _id: 'event-test', status: 'active' }, undefined]) {
      await React.act(async () => {
        root.render(React.createElement(CardButtons, { item, typeOfItem: 'event', alwaysCompact: true }))
      })
      assert.equal(Boolean(container.querySelector('button')), Boolean(item?._id))
    }
  } finally {
    await React.act(async () => root.unmount())
  }
})

test('event card menu shows edit shortcuts for the selected form', async () => {
  const CardButtons = loadComponent('components/CardButtons.js').default
  const container = document.createElement('div')
  const root = createRoot(container)
  const item = { _id: 'event-test', status: 'active' }
  const edit = () => {}
  try {
    await React.act(async () => root.render(React.createElement(CardButtons, {
      item, typeOfItem: 'event', minimalActions: true, alwaysCompact: true,
      onEdit: edit, onEditClientContacts: edit, onEditFinanceDocs: edit,
    })))
    assert.match(container.textContent, /Клиент и контакты/)
    assert.match(container.textContent, /Финансы и документы/)

    await React.act(async () => root.render(React.createElement(CardButtons, {
      item, typeOfItem: 'event', minimalActions: true, alwaysCompact: true,
      onEdit: edit, onEditFinanceDocs: edit, editFinanceLabel: 'Финансы',
    })))
    assert.doesNotMatch(container.textContent, /Клиент и контакты/)
    assert.match(container.textContent, /Финансы/)
    assert.doesNotMatch(container.textContent, /Финансы и документы/)
  } finally {
    await React.act(async () => root.unmount())
  }
})

test('card menus have no copy ID action for developers', async () => {
  const CardButtons = loadComponent('components/CardButtons.js').default
  const container = document.createElement('div')
  const root = createRoot(container)
  atoms.loggedUserAtom.role = 'dev'
  try {
    for (const typeOfItem of ['event', 'client', 'transaction', 'user']) {
      await React.act(async () => root.render(React.createElement(CardButtons, {
        item: { _id: 'test-id', status: 'active' }, typeOfItem,
        alwaysCompact: true,
      })))
      assert.doesNotMatch(container.textContent, /Скопировать ID/)
    }
  } finally {
    atoms.loggedUserAtom.role = 'user'
    await React.act(async () => root.unmount())
  }
})

test('event view with an empty detail cache shows loading and no header actions', async () => {
  const eventViewFunc = loadComponent('layouts/modals/modalsFunc/eventViewFunc.js').default
  const View = eventViewFunc('past-event-not-in-cache').Children
  const container = document.createElement('div')
  const root = createRoot(container)
  function Harness() {
    const [header, setTopLeftComponent] = React.useState(null)
    return React.createElement(React.Fragment, null,
      React.createElement('header', null, header),
      React.createElement(View, { setTopLeftComponent })
    )
  }
  try {
    queryState = { data: undefined, isPending: true, isError: false }
    await React.act(async () => root.render(React.createElement(Harness)))
    assert.match(container.textContent, /Загружаем мероприятие/)
    assert.equal(container.querySelector('header').textContent, '')
    assert.equal(container.querySelector('button'), null)

    queryState = {
      data: {
        _id: 'past-event-not-in-cache',
        eventType: 'Тестовое прошедшее мероприятие',
        status: 'active',
        eventDate: '2026-08-01T12:00:00.000Z',
        servicesIds: [],
        additionalEvents: [],
      },
      isPending: false,
      isError: false,
    }
    await React.act(async () => root.render(React.createElement(Harness)))
    assert.ok(container.querySelector('header button'))
    assert.doesNotMatch(container.textContent, /Загружаем мероприятие/)

    queryState = { data: undefined, isPending: false, isError: true }
    await React.act(async () => root.render(React.createElement(Harness)))
    assert.match(container.textContent, /Не удалось загрузить мероприятие/)
    assert.equal(container.querySelector('button'), null)

    queryState = { data: null, isPending: false, isError: false }
    await React.act(async () => root.render(React.createElement(Harness)))
    assert.match(container.textContent, /Мероприятие не найдено/)
  } finally {
    await React.act(async () => root.unmount())
  }
})
