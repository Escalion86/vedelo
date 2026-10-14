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
const queryExports = Module.createRequire(mobile + '/package.json')(
  '@tanstack/react-query'
)
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
  if (id === 'expo-sqlite')
    return {
      openDatabaseAsync: async () => {
        throw Error('Unexpected database access')
      },
    }
  if (id === 'expo-file-system')
    return { Directory: class {}, Paths: { document: '' } }
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

for (const key of ['artistcrm_mobile_user', 'artistcrm_access_token']) {
  test(
    'C-SESSION-01 API rejects session swap during ' +
      key.replace('artistcrm_', '') +
      ' await',
    async () => {
      const gate = deferred(),
        entered = deferred(),
        initiator = context()
      let once = true
      readHook = async (k) => {
        if (k === key && once) {
          once = false
          entered.resolve()
          await gate.promise
        }
      }
      const pending = proposalsApi
        .saveTemplate(undefined, template, initiator)
        .then(
          () => true,
          () => false
        )
      await entered.promise
      await session({ _id: 'replacement' + sequence, tenantId: 'other' })
      gate.resolve()
      assert.equal(
        await pending,
        false,
        'Operation must reject replacement identity'
      )
      assert.equal(
        writes().length,
        0,
        'Old payload must never POST under replacement session'
      )
    }
  )
}
for (const ending of ['swap', 'unmount'])
  test(
    'C-SESSION-01 keyed editor stops pending capture on ' + ending,
    async () => {
      const s = await mount(editor())
      await name(s)
      const gate = deferred(),
        entered = deferred()
      let once = true
      readHook = async (k) => {
        if (k === 'artistcrm_mobile_user' && once) {
          once = false
          entered.resolve()
          await gate.promise
        }
      }
      await press(s, 'Сохранить')
      await entered.promise
      if (ending === 'swap') {
        await session({ _id: 'replacement' + sequence, tenantId: 'other' })
        await act(async () => {
          s.update(editor())
          await settle()
        })
      } else await unmount(s)
      await act(async () => {
        gate.resolve()
        await settle()
      })
      assert.equal(
        writes().length,
        0,
        'Cancelled capture must stop before POST'
      )
    }
  )
for (const method of [
  'get',
  'list',
  'templates',
  'services',
  'templateDefaults',
])
  test(
    'C-SESSION-01 ' + method + ' read never moves to replacement session',
    async () => {
      const gate = deferred(),
        entered = deferred()
      let once = true
      const initiating = context()
      readHook = async (k) => {
        if (k === 'artistcrm_access_token' && once) {
          once = false
          entered.resolve()
          await gate.promise
        }
      }
      const args =
        method === 'get'
          ? ['created', initiating]
          : method === 'list'
            ? ['event', initiating]
            : [initiating]
      const pending = proposalsApi[method](...args).catch(() => null)
      await entered.promise
      await session({ _id: 'replacement' + sequence, tenantId: 'other' })
      gate.resolve()
      await pending
      assert.equal(calls.length, 0, 'No fetch under replacement identity')
    }
  )
for (const kind of ['proposal', 'template'])
  for (const outcome of ['known', 'unknown', 'inflight'])
    test(`C-CREATE-01 ${kind} ${outcome} retains owner across unmount`, async () => {
      const gate = deferred()
      let posted = false,
        exactWorks = false
      requestImpl = async (p, c) => {
        if (c.method === 'POST') {
          posted = true
          if (outcome === 'inflight') return gate.promise
          if (outcome === 'unknown') throw Error('lost response')
          return data(kind === 'template' ? template : proposal)
        }
        if (
          posted &&
          !exactWorks &&
          (p === '/proposals/created' || p === '/proposal-templates/template')
        )
          throw Error('readback unavailable')
        return reads(p)
      }
      let s = await mount(kind === 'template' ? editor() : section())
      if (kind === 'template') {
        await name(s)
        await press(s, 'Сохранить')
      } else {
        await press(s, 'Создать КП')
        await press(s, 'Без шаблона')
      }
      await unmount(s)
      s = await mount(kind === 'template' ? editor() : section())
      const createButton = kind === 'template' ? 'Сохранить' : 'Создать КП'
      assert.equal(
        Boolean(button(s, createButton).props.disabled),
        true,
        'Remount must retain create owner/outcome'
      )
      if (outcome === 'inflight')
        await act(async () => {
          gate.resolve(data(kind === 'template' ? template : proposal))
          await settle()
        })
      if (outcome !== 'unknown') {
        exactWorks = true
        await press(
          s,
          kind === 'template'
            ? 'Повторить чтение созданного шаблона'
            : 'Повторить чтение созданного КП'
        )
        assert.equal(writes().length, 1, 'Known recovery must only exact GET')
        await unmount(s)
        s = await mount(kind === 'template' ? editor() : section())
        assert.equal(
          Boolean(button(s, createButton).props.disabled),
          false,
          'Successful readback releases slot for next intentional new entity'
        )
      }
      assert.equal(writes().length, 1)
    })
for (const ending of ['refocus', 'unmount'])
  test(
    'C-NONIDEMPOTENT-01 inflight Telegram retains owner across ' + ending,
    async () => {
      const gate = deferred()
      requestImpl = async (p, c) =>
        c.method === 'POST'
          ? gate.promise
          : p === '/events/event/proposals'
            ? data([published])
            : p === '/proposals/created'
              ? data(published)
              : reads(p)
      let s = await mount(section())
      await press(s, 'Отправить в Telegram Business')
      if (ending === 'refocus') await refocus()
      else {
        await unmount(s)
        s = await mount(section())
      }
      assert.equal(
        Boolean(button(s, 'Отправить в Telegram Business').props.disabled),
        true,
        'Inflight owner cannot unlock on focus/mount'
      )
      await act(async () => {
        gate.resolve({ success: true })
        await settle()
      })
      assert.equal(writes().length, 1)
    }
  )
test('C-NONIDEMPOTENT-01 lost response fails closed and exact partial recovery only retries failed delivery', async () => {
  let delivered = false
  const partial = {
    ...published,
    delivery: [
      { type: 'text', status: 'sent' },
      { type: 'media', mediaId: 'photo', status: 'failed' },
    ],
  }
  requestImpl = async (p, c) => {
    if (c.method === 'POST') {
      if (!delivered) {
        delivered = true
        throw Error('response lost')
      }
      return { success: true }
    }
    return p === '/events/event/proposals'
      ? data([published])
      : p === '/proposals/created'
        ? data(delivered ? partial : published)
        : reads(p)
  }
  let s = await mount(section())
  await press(s, 'Отправить в Telegram Business')
  await unmount(s)
  s = await mount(section())
  assert.equal(
    Boolean(button(s, 'Отправить в Telegram Business').props.disabled),
    true,
    'Unknown full send remains blocked across remount'
  )
  await press(s, 'Проверить доставку в Telegram')
  assert.equal(
    Boolean(button(s, 'Отправить в Telegram Business').props.disabled),
    true,
    'Partial readback never enables full send'
  )
  await press(s, 'Повторить недоставленное в Telegram')
  assert.deepEqual(
    writes().map((x) => x.body.retryFailedOnly),
    [false, true]
  )
})
test('C-NONIDEMPOTENT-01 401 never refreshes or retries Telegram POST', async () => {
  requestImpl = async () => ({
    httpStatus: 401,
    payload: {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'unauthorized' },
    },
  })
  await assert.rejects(proposalsApi.sendTelegram('created', false, context()))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/proposals/created/send-telegram')
})
test('E-APPLY-01 exact fresh event reaches callback despite optional list failure', async () => {
  let patch = 0,
    lists = 0
  const received = []
  requestImpl = async (p, c) => {
    if (c.method === 'PATCH') {
      patch++
      return data(applied)
    }
    if (p === '/events/event/proposals') {
      if (++lists === 2) throw Error('optional list unavailable')
      return data([patch ? applied : accepted])
    }
    if (p === '/proposals/created') return data(applied)
    if (p === '/mobile/v1/events/event')
      return data({
        _id: 'event',
        status: 'active',
        contractSum: patch ? 900 : 100,
        servicesIds: ['s'],
      })
    return reads(p)
  }
  const s = await mount(
    React.createElement(EventProposalsSection, {
      eventId: 'event',
      onApplied: (value) => received.push(value),
    })
  )
  await press(s, 'Применить выбранный вариант')
  assert.equal(
    received.length,
    1,
    'Confirmed event must be delivered before optional list reload'
  )
  assert.equal(received[0].contractSum, 900)
  assert.equal(
    Boolean(button(s, 'Применить выбранный вариант').props.disabled),
    true,
    'Exact applied snapshot must disable another PATCH despite list failure'
  )
  assert.equal(patch, 1)
  await press(s, 'Повторить загрузку КП')
  assert.equal(patch, 1)
  assert.equal(received.length, 1)
})
test('E-APPLY-01 failed fresh event read recovers without another PATCH or send', async () => {
  let patch = 0,
    eventAvailable = false
  const received = []
  requestImpl = async (p, c) => {
    if (c.method === 'PATCH') {
      patch++
      return data(applied)
    }
    if (p === '/events/event/proposals')
      return data([patch ? applied : accepted])
    if (p === '/proposals/created') return data(applied)
    if (p === '/mobile/v1/events/event') {
      if (patch && !eventAvailable) throw Error('event read unavailable')
      return data({
        _id: 'event',
        status: 'active',
        contractSum: patch ? 900 : 100,
      })
    }
    return reads(p)
  }
  const element = React.createElement(EventProposalsSection, {
    eventId: 'event',
    onApplied: (value) => received.push(value),
  })
  let s = await mount(element)
  await press(s, 'Применить выбранный вариант')
  await unmount(s)
  s = await mount(element)
  eventAvailable = true
  await press(s, 'Повторить чтение применённой работы')
  assert.equal(received.length, 1)
  assert.equal(received[0].contractSum, 900)
  assert.equal(writes().length, 1)
  assert.equal(patch, 1)
})
test.after(() => {
  Module._load = originalLoad
  Module._extensions['.ts'] = originalExtensions.ts
  Module._extensions['.tsx'] = originalExtensions.tsx
})
