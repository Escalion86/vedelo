const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const { NextRequest } = require('next/server')

test('legacy payment/telephony webhooks redirect before API lockdown, preserving path and query', async () => {
  await loadBindings()
  const helpers = await import('../../helpers/domainMigration.mjs')
  const { code } = transformSync(readFileSync('proxy.js', 'utf8'), {
    filename: 'proxy.js',
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => (id === '@helpers/domainMigration.mjs' ? helpers : require(id)),
    mod,
    mod.exports
  )
  const originalStart = process.env.BRAND_MIGRATION_STARTED_AT
  try {
    for (const days of [null, 5, 20, 31]) {
      process.env.BRAND_MIGRATION_STARTED_AT =
        days === null
          ? ''
          : new Date(Date.now() - days * 86400_000).toISOString()
      for (const path of [
        '/api/billing/tochka/webhook',
        '/api/billing/yookassa/webhook',
        '/api/telephony/novofon/webhook',
        '/api/telephony/generic/webhook',
        '/api/integrations/vk/webhook/test-token',
        '/api/public/lead/tilda',
      ]) {
        for (const host of ['artistcrm.ru', 'www.artistcrm.ru']) {
          const response = mod.exports.proxy(
            new NextRequest(`https://${host}${path}?check=synthetic`, {
              method: 'POST',
              headers: { host },
              body: '{}',
            })
          )
          assert.equal(response.status, 308, `${path}, day ${days}`)
          assert.equal(
            response.headers.get('location'),
            `https://vedelo.ru${path}?check=synthetic`
          )
        }
      }
      const privateApi = mod.exports.proxy(
        new NextRequest('https://artistcrm.ru/api/events', {
          headers: { host: 'artistcrm.ru' },
        })
      )
      assert.equal(privateApi.status, days === 31 ? 410 : 200)
      assert.equal(privateApi.headers.get('location'), null)
    }
  } finally {
    if (originalStart === undefined)
      delete process.env.BRAND_MIGRATION_STARTED_AT
    else process.env.BRAND_MIGRATION_STARTED_AT = originalStart
  }
})
