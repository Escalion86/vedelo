const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const user = {
  _id: '123456789012345678901234',
  tenantId: '123456789012345678901234',
}
const event = { _id: 'event', clientId: 'client', status: 'draft' }
before(() => loadBindings())
function load(filename, resolve) {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => {
      const value = resolve(id)
      return value?.default ? { __esModule: true, ...value } : value
    },
    compiledModule,
    compiledModule.exports
  )
  return compiledModule.exports.default
}
function fetcher({ failClients = false, failDb = false } = {}) {
  const model = (name) => ({
    updateMany: async () => {},
    find: (filter) => {
      if (name === 'Clients')
        assert.equal(String(filter.tenantId), user.tenantId)
      const chain = {
        select: () => chain,
        sort: () => chain,
        limit: () => chain,
        lean: async () => {
          if (name === 'Clients' && failClients)
            throw new Error('test read failure')
          return name === 'Events' ? [event] : []
        },
      }
      return chain
    },
    findOne: () => ({ lean: async () => ({}) }),
    findById: () => ({ select: () => ({ lean: async () => user }) }),
    aggregate: async () => [],
  })
  return load('server/fetchProps.js', (id) => {
    if (id === './dbConnect')
      return {
        default: async () => {
          if (failDb) throw new Error('test db failure')
          return {}
        },
      }
    if (id.startsWith('@models/'))
      return { default: model(id.split('/').pop()) }
    if (id === '@server/userMutationActivity')
      return { withUserMutationActivity: async (x) => x }
    if (id === '@server/aiIncludedEstimate')
      return { withAiIncludedEstimates: async (x) => x }
    if (id === '@server/telegramBusiness')
      return { sanitizeTelegramSiteSettings: (x) => x }
    if (id === '@helpers/userEventStats')
      return { applyUserEventStats: (x) => x }
    return require(id)
  })
}
test('fetchProps: не загруженный список — null, успешный [] — []', async () => {
  const fetchProps = fetcher()
  assert.equal((await fetchProps(user, 'profile')).clients, null)
  assert.deepEqual((await fetchProps(user, 'eventsUpcoming')).clients, [])
})
test('fetchProps: ошибка клиентов сохраняет события и не выдаёт фиктивный []', async () => {
  const result = await fetcher({ failClients: true })(user, 'eventsUpcoming')
  assert.equal(result.clients, null)
  assert.deepEqual(result.events, [event])
})
test('fetchProps: общий degraded payload не подтверждает пустой список клиентов', async () => {
  assert.equal((await fetcher({ failDb: true })(user)).clients, null)
})
test('серверный page normalizer не превращает unavailable clients в []', async () => {
  for (const clients of [null, undefined, [], [{ _id: 'client' }]]) {
    const page = load('app/cabinet/[page]/page.js', (id) => {
      if (id === 'next-auth')
        return { getServerSession: async () => ({ user }) }
      if (id === 'next/navigation')
        return {
          redirect: () => {
            throw new Error('unexpected redirect')
          },
        }
      if (id === './cabinet') return { default: () => null }
      if (id === '@server/fetchProps')
        return { default: async () => ({ clients }) }
      if (id.includes('_options')) return { default: {} }
      return require(id)
    })
    const result = await page({ params: { page: 'eventsUpcoming' } })
    assert.deepEqual(
      result.props.clients,
      Array.isArray(clients) ? clients : null
    )
  }
})
