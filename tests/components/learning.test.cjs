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
let LearningContent,
  LearningTip,
  state,
  command,
  completed = true
let getAccess, learningUser, learningTariffs
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
  const terms = compile('helpers/workItemTerminology.mjs')
  const catalog = compile('helpers/learningCatalog.mjs', (id) =>
    id === './workItemTerminology.mjs' ? terms : require(id)
  )
  getAccess = compile('helpers/learningAccess.mjs', (id) =>
    id === './tariffAccess.js'
      ? compile('helpers/tariffAccess.js')
      : require(id)
  ).getLearningAccess
  const resolve = (id) => {
    if (id === '@helpers/learningCatalog.mjs') return catalog
    if (id === '@helpers/useWorkItemTerminology')
      return () => terms.resolveWorkItemTerminology()
    if (id === '@helpers/useLearning') return { useLearning: () => state }
    if (id === '@helpers/useLearningAccess')
      return () => (article) =>
        getAccess(article, learningUser, learningTariffs)
    if (id === 'jotai')
      return {
        useAtomValue: (atom) =>
          atom === 'settings'
            ? { custom: { firstRunWizardCompleted: completed } }
            : atom === 'modals'
              ? []
              : { user: { firstRunTour() {} } },
      }
    if (id === '@state/atoms/siteSettingsAtom') return 'settings'
    if (id === '@state/atoms/modalsAtom') return 'modals'
    if (id === '@state/atoms/modalsFuncAtom') return 'functions'
    if (id.endsWith('.module.css')) return {}
    if (id === 'next/link')
      return ({ children, href, ...props }) =>
        React.createElement('a', { href, ...props }, children)
    if (id === 'next/navigation')
      return { useSearchParams: () => new URLSearchParams() }
    if (id === '@components/Notice')
      return ({ children, role }) =>
        React.createElement('div', { role }, children)
    return require(id)
  }
  LearningContent = compile(
    'layouts/content/LearningContent.js',
    resolve
  ).default
  LearningTip = compile('components/LearningTip.js', resolve).default
})
test.after(() => dom.window.close())

test('late mutation response stays with its original account after switching user', async () => {
  const cache = new Map()
  let user = { _id: 'user-a', tenantId: 'tenant-a' }
  let mutationOptions, submission
  const client = {
    getQueryData: (key) => cache.get(JSON.stringify(key)),
    setQueryData: (key, update) => {
      const id = JSON.stringify(key)
      cache.set(id, update(cache.get(id)))
    },
  }
  const hook = compile('helpers/useLearning.js', (id) => {
    if (id === 'jotai') return { useAtomValue: () => user }
    if (id === '@state/atoms/loggedUserAtom') return {}
    if (id === '@helpers/apiClient')
      return { apiJson: async () => ({ data: {} }) }
    if (id === '@tanstack/react-query')
      return {
        useQuery: () => ({}),
        useQueryClient: () => client,
        useMutation: (options) => {
          mutationOptions = options
          return {
            mutate: (variables) => {
              submission = variables
            },
          }
        },
      }
    return require(id)
  }).useLearning
  hook().mutation.mutate({ action: 'known', articleId: 'calendar' })
  user = { _id: 'user-b', tenantId: 'tenant-b' }
  hook()
  mutationOptions.onSuccess({ revision: 2, knownIds: ['calendar'] }, submission)
  assert.deepEqual(
    client.getQueryData(['learning', 'tenant-a', 'user-a']).knownIds,
    ['calendar']
  )
  assert.equal(
    client.getQueryData(['learning', 'tenant-b', 'user-b']),
    undefined
  )
  mutationOptions.onSuccess({ revision: 1, knownIds: [] }, submission)
  assert.deepEqual(
    client.getQueryData(['learning', 'tenant-a', 'user-a']).knownIds,
    ['calendar']
  )
})

async function setup(t, Component) {
  command = null
  completed = true
  learningUser = { tariffId: 'base' }
  learningTariffs = [
    { _id: 'base', title: 'Базовый', price: 0 },
    {
      _id: 'pro',
      title: 'Профи',
      price: 500,
      allowDocuments: true,
      allowCalendarSync: true,
      allowAi: true,
    },
  ]
  state = {
    data: {
      enabled: true,
      readIds: [],
      knownIds: [],
      tipId: 'next-contact',
      tipDismissed: false,
    },
    activityQuery: { isSuccess: true },
    mutation: {
      mutate: (value) => {
        command = value
      },
    },
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = () =>
    React.act(() => root.render(React.createElement(Component)))
  await render()
  t.after(async () => {
    await React.act(() => root.unmount())
    container.remove()
  })
  return { container, render }
}

test('locked lessons stay readable and markable; tariff change restores the working link', async (t) => {
  const ui = await setup(t, LearningContent)
  assert.equal(ui.container.querySelectorAll('details').length, 10)
  const article = [...ui.container.querySelectorAll('details')].find((d) =>
    d.textContent.includes('Готовьте документы по шаблону')
  )
  assert.match(
    article.querySelector('summary').textContent,
    /Доступно с тарифа «Профи»/
  )
  await React.act(() => article.querySelector('summary').click())
  assert.equal(article.open, true)
  assert.equal(
    article.querySelector('a').getAttribute('href'),
    '/cabinet/tariff-select'
  )
  assert.equal(article.querySelector('a').textContent, 'Посмотреть тарифы')
  assert.equal(article.querySelector('ol').children.length, 3)
  await React.act(() => article.querySelector('button').click())
  assert.deepEqual(command, { action: 'read', articleId: 'document-templates' })
  learningUser = { tariffId: 'pro' }
  await ui.render()
  assert.doesNotMatch(
    article.querySelector('summary').textContent,
    /Доступно с тарифа/
  )
  assert.equal(
    article.querySelector('a').getAttribute('href'),
    '/cabinet/documents'
  )
})

test('unavailable tip shows its tariff but keeps the instruction link', async (t) => {
  const ui = await setup(t, LearningTip)
  state.data.tipId = 'calendar'
  await ui.render()
  assert.ok(ui.container.querySelector('aside'))
  assert.match(ui.container.textContent, /Доступно с тарифа «Профи»/)
  assert.equal(
    ui.container.querySelector('a').getAttribute('href'),
    '/cabinet/learning?article=calendar'
  )
})
test('checkbox reflects pending preference and rolls back with visible error; reading remains explicit', async (t) => {
  const ui = await setup(t, LearningContent)
  const checkbox = () => ui.container.querySelector('input[type="checkbox"]')
  assert.equal(checkbox().checked, true)
  await React.act(() => checkbox().click())
  assert.deepEqual(command, { action: 'preference', enabled: false })
  Object.assign(state.mutation, { isPending: true, variables: command })
  await ui.render()
  assert.equal(checkbox().checked, false)
  assert.equal(checkbox().disabled, true)
  Object.assign(state.mutation, { isPending: false, isError: true })
  await ui.render()
  assert.equal(checkbox().checked, true)
  assert.match(
    ui.container.querySelector('[role="alert"]').textContent,
    /Не удалось сохранить/
  )
  command = null
  await React.act(() => ui.container.querySelector('summary').click())
  assert.equal(command, null, 'opening a material must not pretend it was read')
  const mark = [...ui.container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Отметить прочитанным'
  )
  await React.act(() => mark.click())
  assert.deepEqual(command, { action: 'read', articleId: 'next-contact' })
})
test('tip remains hidden during onboarding, after dismiss/read/known, when disabled or catalog exhausted', async (t) => {
  const ui = await setup(t, LearningTip)
  assert.ok(ui.container.querySelector('aside'))
  completed = false
  await ui.render()
  assert.equal(ui.container.querySelector('aside'), null)
  completed = true
  for (const patch of [
    { enabled: false },
    { tipDismissed: true },
    { readIds: ['next-contact'] },
    { knownIds: ['next-contact'] },
    { tipId: null },
  ]) {
    const old = state.data
    state.data = { ...old, ...patch }
    await ui.render()
    assert.equal(ui.container.querySelector('aside'), null)
    state.data = old
  }
  await ui.render()
  const known = [...ui.container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Уже знаю'
  )
  await React.act(() => known.click())
  assert.deepEqual(command, { action: 'known', articleId: 'next-contact' })
})
