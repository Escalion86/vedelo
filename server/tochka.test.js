import test from 'node:test'
import assert from 'node:assert/strict'
import { createTochkaPayment } from './tochka.js'

const ENV_KEYS = [
  'TOCHKA_API_TOKEN',
  'TOCHKA_CUSTOMER_CODE',
  'TOCHKA_MERCHANT_ID',
  'TOCHKA_SEND_RECEIPT',
]

test('платёж Точки использует актуальный paymentLinkId без лишних полей', async (t) => {
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  )
  const originalFetch = globalThis.fetch

  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    globalThis.fetch = originalFetch
  })

  process.env.TOCHKA_API_TOKEN = 'test-token'
  process.env.TOCHKA_CUSTOMER_CODE = '300000092'
  process.env.TOCHKA_MERCHANT_ID = '200000000001056'
  process.env.TOCHKA_SEND_RECEIPT = 'false'

  let request = null
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          Data: {
            operationId: 'operation-id',
            paymentLink: 'https://example.test/payment',
          },
        }),
    }
  }

  await createTochkaPayment({
    amount: 100,
    description: 'Оплата Ведело',
    idempotenceKey: '68618f22-e1eb-4cc2-88dd-4d832b0c89c8',
    returnUrl: 'https://vedelo.ru/cabinet/tariff-select?payment=tochka',
    metadata: { paymentId: 'must-not-be-sent' },
  })

  assert.equal(
    request.url,
    'https://enter.tochka.com/uapi/acquiring/v1.0/payments'
  )
  const body = JSON.parse(request.options.body)
  assert.equal(
    body.Data.paymentLinkId,
    '68618f22-e1eb-4cc2-88dd-4d832b0c89c8'
  )
  assert.equal(body.Data.customerCode, '300000092')
  assert.equal(body.Data.merchantId, '200000000001056')
  assert.deepEqual(body.Data.paymentMode, ['sbp'])
  assert.equal('orderId' in body.Data, false)
  assert.equal('metadata' in body.Data, false)
})
