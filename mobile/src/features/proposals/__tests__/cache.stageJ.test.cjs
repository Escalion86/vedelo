'use strict'
// Real tokenStore, identity, feature API, shared client and keyed components.
// Only native UI/router, SecureStore, Expo platform and network are seams.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const mobile = path.resolve(__dirname, '../../../..')
const ts = require(mobile + '/node_modules/typescript')
const React = require(mobile + '/node_modules/react')
const renderer = require(mobile + '/node_modules/react-test-renderer')
const { act } = renderer
const { DatabaseSync } = require('node:sqlite')
const database = new DatabaseSync(':memory:')
const sqlite = {
  execAsync: async (sql) => database.exec(sql),
  runAsync: async (sql, ...params) => database.prepare(sql).run(...params),
  getFirstAsync: async (sql, ...params) =>
    sql.includes('cipher_version')
      ? { cipher_version: 'test-platform' }
      : database.prepare(sql).get(...params),
  getAllAsync: async (sql, ...params) => database.prepare(sql).all(...params),
  withTransactionAsync: async (fn) => fn(),
}
const queryExports = require(mobile + '/node_modules/@tanstack/react-query')
const { QueryClient, QueryClientProvider } = queryExports
const originalLoad = Module._load
const originalExtensions = {
  ts: Module._extensions['.ts'],
  tsx: Module._extensions['.tsx'],
}
function readSource(file) {
  const relative = path.relative(mobile, file)
  const frozen = process.env.STAGEJ_BASELINE_DIR
  const allowed = [
    'identity.ts',
    'api.ts',
    'EventProposalsSection.tsx',
    'ProposalEditorScreen.tsx',
  ]
  return fs.readFileSync(
    frozen &&
      relative.startsWith('src/features/proposals/') &&
      allowed.includes(path.basename(file))
      ? path.join(frozen, 'mobile', relative)
      : file,
    'utf8'
  )
}
for (const ext of ['.ts', '.tsx'])
  Module._extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(readSource(file), {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
        },
      }).outputText,
      file
    )
global.IS_REACT_ACT_ENVIRONMENT = true
global.React = React
let user,
  readHook,
  requestImpl,
  sequence = 0,
  calls = [],
  mounts = [],
  routes = []
const store = new Map(),
  focuses = new Map()
const host = (name) => (props) =>
  React.createElement(name, props, props.children)
const ui = new Proxy({}, { get: (_, name) => host(name) })
Module._load = function (id, parent, main) {
  if (id === '@tanstack/react-query') return queryExports
  if (id === 'expo-sqlite') return { openDatabaseAsync: async () => sqlite }
  if (id === 'expo-file-system')
    return { Directory: class {}, Paths: { document: '' } }
  if (id === '@react-native-community/netinfo')
    return {
      useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
    }
  if (id === 'react') return React
  if (id === 'react-native')
    return {
      Platform: { OS: 'android' },
      Alert: {
        alert(_title, _text, choices) {
          choices
            ?.find((x) => ['Применить', 'Удалить'].includes(x.text))
            ?.onPress?.()
        },
      },
      Share: { share: async () => {} },
      StyleSheet: { create: (x) => x },
      Text: 'Text',
      View: 'View',
      Modal: 'Modal',
      ScrollView: 'ScrollView',
    }
  if (id === 'expo-secure-store')
    return {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key) => {
        if (readHook) await readHook(key)
        return store.get(key) || null
      },
      setItemAsync: async (key, value) => store.set(key, value),
      deleteItemAsync: async (key) => store.delete(key),
    }
  if (id === 'expo-application')
    return {
      getAndroidId: () => 'test-device',
      nativeApplicationVersion: 'test',
    }
  if (id === 'expo-device') return { modelName: 'test-device' }
  if (id === 'expo-crypto') return { randomUUID: () => 'test-uuid' }
  if (id === 'expo-document-picker')
    return { getDocumentAsync: async () => ({ canceled: true }) }
  if (id === 'expo-clipboard') return { setStringAsync: async () => {} }
  if (id === 'expo-router')
    return {
      router: { push: (value) => routes.push(value) },
      useNavigation: () => ({ dispatch() {} }),
      useFocusEffect: (fn) =>
        React.useEffect(() => {
          focuses.set(fn, fn())
          return () => {
            focuses.get(fn)?.()
            focuses.delete(fn)
          }
        }, [fn]),
    }
  if (id === '@react-navigation/native') return { usePreventRemove() {} }
  if (id.endsWith('/config/env'))
    return { env: { apiBaseUrl: 'https://stagej.invalid/api' } }
  if (id.endsWith('/ui/components')) return ui
  if (id.endsWith('/ui/ThemeProvider'))
    return {
      useThemeStyles: () => ({}),
      useTheme: () => ({ palette: { mode: 'light' } }),
    }
  if (id.endsWith('/ui/FieldHelp')) return { FieldHelp: host('FieldHelp') }
  if (id === './RichTextEditor')
    return { RichTextEditor: host('RichTextEditor') }
  if (id === './ProposalPreview')
    return { ProposalPreview: host('ProposalPreview') }
  return originalLoad.call(this, id, parent, main)
}
const tokens = require(mobile + '/src/shared/auth/tokenStore.ts')
const { AuthProvider } = require(mobile + '/src/shared/auth/AuthProvider.tsx')
const { proposalIdentity } = require('../identity.ts')
const { proposalsApi } = require('../api.ts')
const { EventProposalsSection } = require('../EventProposalsSection.tsx')
const { ProposalEditorScreen } = require('../ProposalEditorScreen.tsx')
const pack = {
  id: 'main',
  title: 'Основной',
  description: '',
  lines: [],
  total: 0,
  manualTotal: true,
  recommended: false,
}
const template = {
  _id: 'template',
  name: 'Имя',
  status: 'active',
  blocks: [],
  media: [],
  messageTemplate: '',
  defaults: { packages: [pack], servicesIds: [] },
}
const proposal = {
  _id: 'created',
  eventId: 'event',
  title: 'КП',
  version: 1,
  status: 'draft',
  blocksSnapshot: [],
  mediaSnapshot: [],
  packages: [pack],
  messageText: '',
}
const published = {
  ...proposal,
  status: 'published',
  publicUrl: 'https://stagej.invalid/proposal',
}
const accepted = { ...published, selectedPackageId: 'main' }
const applied = {
  ...accepted,
  appliedAt: '2026-10-11',
  appliedPackageId: 'main',
}
const data = (value) => ({ success: true, data: value })
function reads(p) {
  if (p === '/mobile/v1/onboarding') return data({ completed: true })
  if (p === '/services') return data([])
  if (
    p === '/proposal-templates/defaults' ||
    p === '/proposal-templates/template'
  )
    return data(template)
  if (p === '/proposal-templates') return data([template])
  if (p === '/events/event/proposals') return data([])
  if (p === '/mobile/v1/events/event')
    return data({ _id: 'event', status: 'active', contractSum: 100 })
  if (p === '/proposals/created') return data(proposal)
  throw Error('Unexpected route: ' + p)
}
global.fetch = async (url, options) => {
  const p = new URL(url).pathname.replace(/^\/api/, '')
  const c = {
    path: p,
    method: options.method,
    body: options.body ? JSON.parse(options.body) : undefined,
    identity:
      options.headers.Authorization === `Bearer synthetic-${user._id}`
        ? proposalIdentity(user)
        : 'bound-previous-session',
    skipRefresh: !p.includes('/auth/refresh'),
  }
  calls.push(c) // Never retain or print token values or request headers.
  if (options.signal?.aborted) throw Error('aborted')
  const result = await requestImpl(p, c)
  return new Response(
    JSON.stringify(result?.httpStatus ? result.payload : result),
    {
      status: result?.httpStatus || 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
const settle = () => new Promise((r) => setTimeout(r, 15))
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const button = (s, title) =>
  s.root.findAllByType('Button').find((n) => n.props.title === title)
const context = () => ({ expectedIdentity: proposalIdentity(user) })
async function session(next) {
  user = next
  await tokens.setAuthSession({
    user,
    accessToken: `synthetic-${user._id}`,
    refreshToken: 'synthetic-refresh',
    expiresIn: 0,
    tokenType: 'Bearer',
  })
}
const renderCaches = new Map()
async function mount(element) {
  const externallyWrapped = element.type === QueryClientProvider
  const cache = externallyWrapped
    ? element.props.client
    : new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      })
  const frame = (child) =>
    React.createElement(
      QueryClientProvider,
      { client: cache },
      React.createElement(
        AuthProvider,
        null,
        externallyWrapped ? child.props.children : child
      )
    )
  let s
  await act(async () => {
    s = renderer.create(frame(element))
    await settle()
    await settle()
  })
  const update = s.update.bind(s)
  s.update = (child) => update(frame(child))
  renderCaches.set(s, externallyWrapped ? null : cache)
  mounts.push(s)
  return s
}
async function unmount(s) {
  await act(async () => s.unmount())
  renderCaches.get(s)?.clear()
  renderCaches.delete(s)
  mounts = mounts.filter((x) => x !== s)
}
async function press(s, title) {
  const b = button(s, title)
  assert(b, 'Expected action: ' + title)
  assert(!b.props.disabled, 'Action disabled: ' + title)
  await act(async () => {
    b.props.onPress()
    await settle()
  })
}
async function refocus() {
  await act(async () => {
    for (const [fn, clean] of focuses) {
      clean?.()
      focuses.set(fn, fn())
    }
    await settle()
  })
}
async function name(s) {
  await act(async () =>
    s.root
      .findAllByType('CompactField')
      .find((n) => n.props.label === 'Название шаблона')
      .props.onChangeText('Новый шаблон')
  )
}
const writes = () => calls.filter((x) => x.method !== 'GET')
const section = () =>
  React.createElement(EventProposalsSection, { eventId: 'event' })
const editor = () =>
  React.createElement(ProposalEditorScreen, { kind: 'template', id: 'new' })
test.beforeEach(async () => {
  calls = []
  routes = []
  readHook = null
  requestImpl = async (p) => reads(p)
  await session({ _id: 'u' + ++sequence, tenantId: 'tenant' + sequence })
})
test.afterEach(async () => {
  readHook = null
  for (const s of [...mounts]) await unmount(s)
})

const { EventOnlineSections } = require('../EventOnlineSections.tsx')
const cacheStore = require(mobile + '/src/shared/storage/cache.ts')
for (const mode of ['list-failure', 'event-recovery'])
  test('E-APPLY-01 actual SQLite and Query cache merge: ' + mode, async () => {
    const saved = {
      _id: 'event',
      status: 'active',
      syncStatus: 'synced',
      description: 'Keep description',
      clientId: 'client',
      documents: [{ name: 'Keep document' }],
      additionalEvents: [{ title: 'Keep contact' }],
      contractSum: 100,
    }
    await cacheStore.upsertEntities('events', [saved])
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    cache.setQueryData(['cached-entities', 'events'], [saved])
    let patched = false,
      lists = 0,
      eventWorks = mode === 'list-failure'
    requestImpl = async (p, c) => {
      if (c.method === 'PATCH') {
        patched = true
        return data(applied)
      }
      if (p === '/mobile/v1/billing')
        return data({ currentTariff: { allowProposals: true } })
      if (p.startsWith('/client-reviews'))
        return data({ items: [], total: 0, allowClientReviews: false })
      if (p === '/events/event/proposals') {
        if (++lists === 2 && mode === 'list-failure')
          throw Error('optional list down')
        return data([patched ? applied : accepted])
      }
      if (p === '/proposals/created') return data(applied)
      if (p === '/mobile/v1/events/event') {
        if (patched && !eventWorks) throw Error('event down')
        return data({
          _id: 'event',
          status: 'active',
          contractSum: patched ? 900 : 100,
          servicesIds: ['service'],
          agreedProposal: { title: 'Agreed' },
          syncVersion: 7,
        })
      }
      return reads(p)
    }
    const element = React.createElement(
      QueryClientProvider,
      { client: cache },
      React.createElement(EventOnlineSections, { event: saved })
    )
    let s = await mount(element)
    await act(async () => {
      await settle()
      await settle()
    })
    await press(s, 'Применить выбранный вариант')
    if (mode === 'event-recovery') {
      await unmount(s)
      s = await mount(element)
      eventWorks = true
      await press(s, 'Повторить чтение применённой работы')
    }
    const persisted = await cacheStore.getCachedEntity('events', 'event')
    assert.equal(
      persisted.contractSum,
      900,
      'Actual cache must receive confirmed server sum'
    )
    for (const field of [
      'documents',
      'additionalEvents',
      'description',
      'clientId',
    ])
      assert.deepEqual(
        persisted[field],
        saved[field],
        'Unrelated event field retained: ' + field
      )
    assert.equal(
      cache.getQueryData(['cached-entities', 'events'])[0].contractSum,
      900
    )
    assert.equal(
      cache.getQueryState(['cached-entities', 'events']).isInvalidated,
      true
    )
    assert.equal(
      writes().length,
      1,
      'Recovery has no extra PATCH/Telegram/write'
    )
    await unmount(s)
    cache.clear()
  })
test.after(() => {
  database.close()
  Module._load = originalLoad
  Module._extensions['.ts'] = originalExtensions.ts
  Module._extensions['.tsx'] = originalExtensions.tsx
})
