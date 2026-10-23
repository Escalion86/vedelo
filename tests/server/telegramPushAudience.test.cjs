const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
function load(file, mocks) {
  const { code } = transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
    loaded,
    loaded.exports
  )
  return loaded.exports
}
test('Telegram audience: delivery matrix, tenant isolation, mute and other providers', async () => {
  await loadBindings()
  const policy = await import('../../helpers/telegramPushAudience.mjs')
  for (const audience of [undefined, 'all', 'clients', 'non_clients']) {
    for (const clientId of [null, 'own', 'foreign', 'deleted', 'muted']) {
      let web = 0,
        expo = 0,
        throttle = 0
      const client =
        clientId === 'own' || clientId === 'muted'
          ? { _id: clientId, messengerPushMuted: clientId === 'muted' }
          : null
      const query = (value) => ({ select: () => ({ lean: async () => value }) })
      const { notifyIncomingClientMessage } = load('server/messengerPush.js', {
        '@models/Clients': {
          findOne: (filter) => {
            assert.equal(filter.tenantId, 'tenant-a')
            return query(client)
          },
        },
        '@models/SiteSettings': {
          findOne: (filter) => {
            assert.deepEqual(filter, { tenantId: 'tenant-a' })
            return query({ custom: { telegramBusinessPushAudience: audience } })
          },
        },
        '@models/Events': { findOne: () => ({ sort: () => query(null) }) },
        '@models/TelegramConversations': {
          findOne: () => query(null),
          updateOne: async () => {
            throttle++
          },
        },
        '@models/VkConversations': {},
        '@models/AvitoConversations': {},
        '@helpers/getPersonFullName': () => 'Client',
        '@helpers/telegramPushAudience.mjs': policy,
        '@helpers/incomingMessageNotification': {
          buildIncomingMessagePushPayload: () => ({}),
        },
        '@server/pushNotifications': {
          sendPushToTenant: async () => {
            web++
            return {}
          },
        },
        '@server/expoPushNotifications': {
          sendExpoPushToTenant: async () => {
            expo++
            return {}
          },
        },
        './pushResultAggregation.js': { aggregatePushResults: () => ({}) },
        './messengerPushThrottle.js': {
          shouldSendExpoPushForConversation: () => true,
        },
      })
      const result = await notifyIncomingClientMessage({
        tenantId: 'tenant-a',
        provider: 'telegram',
        clientId,
        conversationId: 'chat',
      })
      const allowed =
        clientId !== 'muted' &&
        policy.allowsTelegramMessagePush(audience, Boolean(client))
      assert.equal(web, allowed ? 1 : 0)
      assert.equal(expo, allowed ? 1 : 0)
      assert.equal(throttle, allowed ? 1 : 0)
      if (!allowed) assert.equal(result.suppressed, true)
      await notifyIncomingClientMessage({
        tenantId: 'tenant-a',
        provider: 'vk',
        clientId,
      })
      assert.equal(web, (allowed ? 1 : 0) + (clientId === 'muted' ? 0 : 1))
    }
  }
  assert.equal(policy.normalizeTelegramPushAudience('invalid'), 'all')
  assert.equal(policy.isTelegramPushAudience({ $ne: 'all' }), false)
})

test('settings API: save/read for own tenant, reject invalid enum, unauthorized and tariff', async () => {
  await loadBindings()
  const policy = await import('../../helpers/telegramPushAudience.mjs')
  let tenantId = 'tenant-a',
    allowed = true
  const records = {
    'tenant-a': { custom: {} },
    'tenant-b': { custom: { telegramBusinessPushAudience: 'non_clients' } },
  }
  const { POST, GET } = load('app/api/site/route.js', {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options?.status ?? 200 }),
      },
    },
    '@models/SiteSettings': {
      findOne: (filter) => ({ lean: async () => records[filter.tenantId] }),
      findOneAndUpdate: async (filter, update) => {
        assert.equal(filter.tenantId, 'tenant-a')
        records[filter.tenantId] = {
          ...records[filter.tenantId],
          ...(update.$set || update),
        }
        return records[filter.tenantId]
      },
    },
    '@server/dbConnect': async () => {},
    '@server/getTenantContext': async () => ({
      tenantId,
      user: { role: 'user' },
    }),
    '@server/getUserTariffAccess': async () => ({}),
    '@server/integrationAccess': {
      getProtectedCustomAccessFailures: () => (allowed ? [] : ['Telegram']),
    },
    '@server/telegramBusiness': { sanitizeTelegramSiteSettings: (x) => x },
    '@helpers/siteSettingsCustom.mjs': {
      mergeSiteSettingsCustom: (a, b) => ({ ...a, ...b }),
    },
    '@helpers/telegramPushAudience.mjs': policy,
    '@server/tenantTerminology': {
      clearTenantWorkItemTerminologyCache: () => {},
    },
  })
  const request = (value) => ({
    json: async () => ({
      tenantId: 'tenant-b',
      custom: { telegramBusinessPushAudience: value },
    }),
  })
  for (const value of ['all', 'clients', 'non_clients']) {
    assert.equal((await POST(request(value))).status, 200)
    assert.equal(
      (await GET()).body.data.custom.telegramBusinessPushAudience,
      value
    )
    assert.equal(
      records['tenant-b'].custom.telegramBusinessPushAudience,
      'non_clients'
    )
  }
  for (const value of [null, false, 'unknown', { $ne: 'all' }])
    assert.equal((await POST(request(value))).status, 400)
  allowed = false
  assert.equal((await POST(request('all'))).status, 403)
  tenantId = null
  assert.equal((await POST(request('all'))).status, 401)
})
