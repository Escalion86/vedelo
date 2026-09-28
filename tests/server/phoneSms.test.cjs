const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

function load(file, mocks, env = {}) {
  const { code } = transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(
    (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
      return mocks[name]
    },
    loaded,
    loaded.exports,
    { env },
    mocks.fetch
  )
  return loaded.exports
}

test('Telefon-IP balance contract, alerts and safe failures', async () => {
  await loadBindings()
  let value = 100
  let providerOk = true
  let transportError = false
  let claimed = false
  let sent = 1
  let pushes = 0
  const monitor = load(
    'server/telefonipBalance.js',
    {
      fetch: async (url, options) => {
        assert.equal(
          url,
          'https://api.telefon-ip.ru/api/v1/authcalls/private-key/get_balance/'
        )
        assert.equal(options.cache, 'no-store')
        if (transportError) throw new Error(url)
        return {
          ok: providerOk,
          json: async () => ({ success: providerOk, data: { balance: value } }),
        }
      },
      '@server/dbConnect': async () => {},
      '@models/Users': {
        find: (query) => {
          assert.deepEqual(query, { role: 'dev', archive: { $ne: true } })
          return {
            select: () => ({
              lean: async () => [{ _id: 'dev', tenantId: 'dev-tenant' }],
            }),
          }
        },
      },
      '@models/SiteSettings': {
        updateOne: async (query, update) => {
          assert.equal(query.tenantId, null)
          if (update.$setOnInsert) return {}
          if (update.$unset) {
            claimed = false
            return {}
          }
          assert.ok(
            query.$or[2]['telefonipBalance.lastAlertAt'].$lte instanceof Date
          )
          if (claimed) return { modifiedCount: 0 }
          claimed = true
          return { modifiedCount: 1 }
        },
      },
      '@server/multiChannelPush': {
        sendMultiChannelPushToTenant: async ({ tenantId, payload }) => {
          pushes++
          assert.equal(tenantId, 'dev-tenant')
          assert.equal(payload.data.url, '/cabinet/phone-auth')
          assert.equal(JSON.stringify(payload).includes('private-key'), false)
          return { sent }
        },
      },
    },
    { TELEFONIP: 'private-key' }
  )
  assert.equal((await monitor.getTelefonipBalance()).status, 'low')
  value = '125.50'
  assert.equal((await monitor.getTelefonipBalance()).balance, 125.5)
  assert.equal((await monitor.checkTelefonipBalance()).status, 'ok')
  assert.equal(pushes, 0)
  value = 0
  await Promise.all([
    monitor.checkTelefonipBalance(),
    monitor.checkTelefonipBalance(),
  ])
  assert.equal(pushes, 1)
  claimed = false
  sent = 0
  await monitor.checkTelefonipBalance()
  assert.equal(claimed, false, 'undelivered alert can be retried')
  for (const invalid of [null, '', ' ', false, {}, 'oops']) {
    value = invalid
    assert.equal((await monitor.getTelefonipBalance()).status, 'error')
  }
  value = 1000
  providerOk = false
  assert.equal((await monitor.getTelefonipBalance()).status, 'error')
  transportError = true
  const failure = await monitor.getTelefonipBalance()
  assert.equal(failure.status, 'error')
  assert.equal(JSON.stringify(failure).includes('private-key'), false)
})

test('SMS provider and registration fallback', async (t) => {
  await loadBindings()
  const requests = []
  const provider = (env, fetch) =>
    load(
      'server/phoneVerification.js',
      {
        '@models/Users': {},
        fetch,
        'node:crypto': require('node:crypto'),
      },
      { NODE_ENV: 'production', ...env }
    )
  const payload = { phone: '79000000001', code: '1234', flow: 'register' }

  await t.test(
    'production without webhook rejects sending and exposes no code',
    async () => {
      const result = await provider({}, () =>
        assert.fail('No provider configured')
      ).sendSmsCode(payload)
      assert.equal(result.ok, false)
      assert.equal(result.error.error.code, 'SMS_PROVIDER_NOT_CONFIGURED')
      assert.equal('debugCode' in result, false)
    }
  )
  await t.test('configured webhook receives phone, code and flow', async () => {
    const result = await provider(
      { PHONE_SMS_SEND_WEBHOOK: 'https://sms.example/send' },
      async (url, options) => {
        assert.equal(url, 'https://sms.example/send')
        assert.equal(options.method, 'POST')
        assert.deepEqual(JSON.parse(options.body), payload)
        return { ok: true }
      }
    ).sendSmsCode(payload)
    assert.deepEqual(result, { ok: true })
  })
  await t.test(
    'webhook failure is not reported as a successful send',
    async () => {
      const result = await provider(
        { PHONE_SMS_SEND_WEBHOOK: 'https://sms.example/send' },
        async () => ({ ok: false })
      ).sendSmsCode(payload)
      assert.equal(result.ok, false)
      assert.equal(result.error.error.code, 'SMS_SEND_ERROR')
    }
  )

  let user = null
  let primaryMethod = 'call'
  let confirm
  const verification = provider({}, null)
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options.status }),
      },
    },
    '@server/dbConnect': async () => {},
    '@server/phoneAuthSettings': {
      getPhoneAuthSettings: async () => ({ primaryMethod }),
    },
    '@models/PhoneConfirms': {
      findOne: async (query) => {
        assert.deepEqual(query, { phone: payload.phone, flow: payload.flow })
        return confirm
      },
    },
    '@server/phoneVerification': {
      ...verification,
      findUserByPhone: async () => user,
      sendSmsCode: async (value) => {
        requests.push(value)
        return { ok: true }
      },
    },
    '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
  }
  const send = load('app/api/phone/verify/sms/send/route.js', mocks).POST
  const check = load('app/api/phone/verify/sms/check/route.js', mocks).POST
  const request = (body) => ({ json: async () => body })
  const reset = () => {
    requests.length = 0
    confirm = {
      flow: 'register',
      confirmed: false,
      smsSendNum: 0,
      tryNum: 0,
      save: async () => {},
    }
  }
  for (const account of [null, { vkId: 'test-vk', password: '' }]) {
    await t.test(
      `SMS registration works for ${account ? 'VK account without password' : 'new account'}`,
      async () => {
        reset()
        user = account
        const sent = await send(request(payload))
        assert.equal(sent.status, 200)
        assert.equal(sent.body.data.smsSent, true)
        assert.equal(requests.length, 1)
        assert.match(confirm.code, /^\d{4}$/)
        const wrong = await check(request({ ...payload, code: '0000' }))
        assert.equal(wrong.status, 400)
        assert.equal(confirm.confirmed, false)
        const checked = await check(
          request({ ...payload, code: requests[0].code })
        )
        assert.equal(checked.status, 200)
        assert.equal(confirm.confirmed, true)
        assert.equal(confirm.code, '')
      }
    )
  }
  await t.test('existing password account cannot register by SMS', async () => {
    reset()
    user = { password: 'existing-hash' }
    const result = await send(request(payload))
    assert.equal(result.status, 409)
    assert.equal(result.body.error.code, 'PHONE_ALREADY_USED')
    assert.equal(requests.length, 0)
  })
  await t.test(
    'SMS-first creates confirmation without a call and throttles resend',
    async () => {
      reset()
      confirm = null
      user = null
      primaryMethod = 'sms'
      mocks['@models/PhoneConfirms'].findOneAndUpdate = async (query) => {
        assert.deepEqual(query, { phone: payload.phone, flow: payload.flow })
        confirm = {
          flow: 'register',
          confirmed: false,
          smsSendNum: 0,
          tryNum: 0,
          save: async () => {},
        }
        return confirm
      }
      const sent = await send(request(payload))
      assert.equal(sent.status, 200)
      assert.equal(sent.body.data.method, 'sms')
      assert.equal(requests.length, 1)
      const repeated = await send(request(payload))
      assert.equal(repeated.status, 429)
      assert.equal(requests.length, 1)
      primaryMethod = 'call'
    }
  )
  await t.test(
    'Telefon-IP uses its SMS endpoint and never returns provider secrets',
    async () => {
      const result = await provider(
        { TELEFONIP: 'test-token', PHONE_VERIFY_SMS_CODE_LENGTH: '6' },
        async (url, options) => {
          assert.equal(
            url,
            'https://api.telefon-ip.ru/api/v1/authcalls/test-token/get_sms_code/89000000001/?code=1234'
          )
          assert.equal(options.cache, 'no-store')
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { code: '1234', id: 10 },
            }),
          }
        }
      ).sendSmsCode(payload)
      assert.deepEqual(result, { ok: true })
      assert.match(
        provider({
          TELEFONIP: 'test-token',
          PHONE_VERIFY_SMS_CODE_LENGTH: '6',
        }).generateSmsCode(),
        /^\d{4}$/
      )
    }
  )
  await t.test(
    'Telefon-IP rejects API errors with HTTP 200, malformed or mismatched replies',
    async () => {
      for (const reply of [
        { success: false },
        null,
        { success: true, data: { code: '9999' } },
      ]) {
        const result = await provider(
          { TELEFONIP: 'test-token' },
          async () => ({ ok: true, json: async () => reply })
        ).sendSmsCode(payload)
        assert.equal(result.ok, false)
        assert.equal(result.error.error.code, 'SMS_SEND_ERROR')
      }
      const result = await provider({ TELEFONIP: 'test-token' }, async () => {
        throw new Error('secret URL')
      }).sendSmsCode(payload)
      assert.equal(result.ok, false)
      assert.equal(JSON.stringify(result).includes('secret URL'), false)
    }
  )
  await t.test(
    'another phone or flow cannot use this confirmation',
    async () => {
      reset()
      user = null
      await send(request(payload))
      mocks['@models/PhoneConfirms'].findOne = async (query) =>
        query.phone === payload.phone && query.flow === payload.flow
          ? confirm
          : null
      for (const body of [
        { ...payload, phone: '79000000002', code: confirm.code },
        { ...payload, flow: 'recovery', code: confirm.code },
      ]) {
        const result = await check(request(body))
        assert.equal(result.status, 404)
        assert.equal(confirm.confirmed, false)
      }
    }
  )
})

test('billing renewal checks Telefon-IP only after authorization', async () => {
  await loadBindings()
  let checks = 0
  const route = load('app/api/billing/renew/route.js', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@server/getTenantContext': async () => ({ user: { role: 'user' } }),
    '@server/dbConnect': async () => {},
    '@server/telefonipBalance': { checkTelefonipBalance: async () => { checks++; return { status: 'error' } } },
    '@server/referralRewards': { retryPendingReferralRewards: async () => ({}) },
    '@server/billingRenewalState': { findVisibleFreeTariff: () => null },
    '@models/Users': { find: () => ({ lean: async () => [] }) },
    '@models/Tariffs': { find: () => ({ lean: async () => [] }) },
    '@models/Payments': {},
    '@models/SiteSettings': {},
  }, { BILLING_CRON_SECRET: 'test-cron' })
  const request = (secret) => ({ url: 'https://example.test/api/billing/renew', headers: new Headers({ 'x-cron-secret': secret }) })
  assert.equal((await route.POST(request('wrong'))).status, 403)
  assert.equal(checks, 0)
  const response = await route.POST(request('test-cron'))
  assert.equal(response.status, 200)
  assert.equal(response.body.data.telefonip.status, 'error')
  assert.equal(checks, 1)
})

test('developer-only global phone authentication settings', async () => {
  await loadBindings()
  let context = {}
  let saved = 'call'
  let writes = 0
  const route = load('app/api/site/phone-auth/route.js', {
    '@server/telefonipBalance': {
      getTelefonipBalance: async () => ({ status: 'ok', balance: 200 }),
    },
    'next/server': {
      NextResponse: {
        json: (body, options = {}) => ({ body, status: options.status || 200 }),
      },
    },
    '@server/getTenantContext': async () => context,
    '@server/phoneAuthSettings': {
      getPhoneAuthSettings: async () => ({ primaryMethod: saved }),
      getPhoneProviderStatus: () => ({
        smsConfigured: true,
        callConfigured: true,
        smsProvider: 'telefonip',
      }),
    },
    '@models/SiteSettings': {
      findOneAndUpdate: async (query, update) => {
        assert.deepEqual(query, { tenantId: null })
        assert.deepEqual(Object.keys(update.$set), [
          'phoneVerification.primaryMethod',
        ])
        saved = update.$set['phoneVerification.primaryMethod']
        writes++
      },
    },
  })
  const request = (primaryMethod) => ({
    json: async () => ({ primaryMethod, tenantId: 'foreign', role: 'dev' }),
  })
  for (const role of [null, 'user', 'admin']) {
    context = role
      ? { user: { _id: 'test-user', role }, tenantId: 'test-tenant' }
      : {}
    assert.equal((await route.GET()).status, 403)
    assert.equal((await route.POST(request('sms'))).status, 403)
  }
  context = {
    user: { _id: 'developer', role: 'dev', impersonation: { active: true } },
    tenantId: 'foreign',
  }
  assert.equal((await route.POST(request('sms'))).status, 403)
  assert.equal(writes, 0)
  context = { user: { _id: 'developer', role: 'dev' }, tenantId: 'developer' }
  assert.equal((await route.POST(request('invalid'))).status, 400)
  assert.equal((await route.POST(request('sms'))).status, 200)
  assert.equal((await route.GET()).body.data.primaryMethod, 'sms')
  assert.equal(writes, 1)
})

test('start uses the global preference only for clients supporting SMS-first', async () => {
  await loadBindings()
  let primaryMethod = 'sms'
  let calls = 0
  let sms = 0
  const verification = load('server/phoneVerification.js', {
    '@models/Users': {},
    'node:crypto': require('node:crypto'),
  })
  const start = load('app/api/phone/verify/start/route.js', {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options.status }),
      },
    },
    '@server/dbConnect': async () => {},
    '@server/phoneAuthSettings': {
      getPhoneAuthSettings: async () => ({ primaryMethod }),
    },
    '@models/PhoneConfirms': {
      findOne: async () => null,
      findOneAndUpdate: async () => {},
    },
    '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
    '@server/phoneVerification': {
      ...verification,
      findUserByPhone: async () => null,
      telefonipStartCall: async () => {
        calls++
        return { ok: true, data: { id: 123 } }
      },
    },
    '../sms/send/route': {
      POST: async (req) => {
        assert.equal((await req.json()).flow, 'register')
        sms++
        return { status: 200, body: { data: { method: 'sms' } } }
      },
    },
  }).POST
  const request = (method) => ({
    json: async () => ({ phone: '79000000001', flow: 'register', method }),
  })
  assert.equal((await start(request('preferred'))).body.data.method, 'sms')
  assert.equal(calls, 0)
  assert.equal(sms, 1)
  assert.equal((await start(request(undefined))).body.data.method, 'call')
  primaryMethod = 'call'
  assert.equal((await start(request('preferred'))).body.data.method, 'call')
  assert.equal(calls, 2)
  assert.equal(sms, 1)
})
