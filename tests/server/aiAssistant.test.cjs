const test = require('node:test')
const assert = require('node:assert/strict')
const { createLoader } = require('./loadWithAliases.cjs')

async function harness({ intent = 'create', clients = [], parsed = {}, context = { tenantId: 'tenant-a', user: { _id: 'owner-a' } }, access = { allowAi: true, hasTariff: true }, completion } = {}) {
  const created = [], calls = [], searches = []
  const query = (data) => ({ select() { return this }, sort() { return this }, lean: async () => data })
  const { load } = await createLoader({
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@server/getRequestContext': async () => context,
    '@server/getUserTariffAccess': async () => access,
    '@server/dbConnect': async () => {},
    '@models/Clients': {
      find(filter) { assert.deepEqual(filter, { tenantId: 'tenant-a' }); return query(clients.filter(c => c.tenantId === filter.tenantId)) },
      async create(value) { assert.equal(value.tenantId, 'tenant-a'); const client = { ...value, _id: 'created' }; created.push(client); return client },
    },
    '@models/Services': { find(filter) { assert.equal(filter.tenantId, 'tenant-a'); return query([]) } },
    '@models/SiteSettings': { findOne(filter) { assert.equal(filter.tenantId, 'tenant-a'); return query({ timeZone: 'Asia/Krasnoyarsk' }) } },
    '@server/aiSettings': { getTenantAiSettings: async (tenantId) => ({ tenantId }) },
    '@server/aiChatCompletion': { requestAiChatCompletion: async (args) => {
      calls.push(args)
      assert.equal(args.settings.tenantId, 'tenant-a')
      assert.equal(args.settings.userId, 'owner-a')
      if (completion !== undefined) return { content: completion }
      return { content: JSON.stringify(calls.length === 1 ? { intent, needsClipboardPhone: false } : parsed) }
    } },
    '@server/aiBilling': { isAiBalanceError: () => false },
    '@server/aiEdit': {
      searchAiEditEvents: async args => { searches.push(args); return { candidates: [], question: 'Нет совпадений' } },
      prepareAiEdit: async args => { searches.push(args); return { planId: 'plan' } },
      applyAiEdit: async () => ({ done: true }),
    },
  })
  const route = load('app/api/events/ai-edit/route.js')
  return { created, calls, searches, post: async (body) => {
    const response = await route.POST(new Request('http://test/api/events/ai-edit', { method: 'POST', body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  } }
}

test('auto create uses the clipboard phone, not the model-selected namesake or another tenant', async () => {
  const h = await harness({ clients: [
    { _id: 'wrong', tenantId: 'tenant-a', firstName: 'Анна', phone: 79991111111 },
    { _id: 'foreign', tenantId: 'tenant-b', phone: 79992222222 },
    { _id: 'correct', tenantId: 'tenant-a', firstName: 'Ольга', phone: 79992222222 },
  ], parsed: { clientId: 'wrong', clientName: 'Анна' } })
  const r = await h.post({ mode: 'auto', text: 'Создай заявку Анны, телефон из буфера', clipboardPhone: '8 (999) 222-22-22', tenantId: 'tenant-b' })
  assert.equal(r.status, 200)
  assert.equal(r.body.fields.clientId, 'correct')
  assert.equal(h.created.length, 0)
  assert.equal(h.calls.length, 2)
})

test('unknown clipboard phone creates a client in the current tenant even when a namesake exists', async () => {
  const h = await harness({ clients: [
    { _id: 'wrong', tenantId: 'tenant-a', firstName: 'Анна', phone: 79991111111 },
    { _id: 'foreign', tenantId: 'tenant-b', phone: 79992222222 },
  ], parsed: { clientId: 'wrong', clientName: 'Анна' } })
  const r = await h.post({ mode: 'auto', text: 'Создай заявку Анна, телефон из буфера', clipboardPhone: '79992222222' })
  assert.equal(r.body.clientCreated, true)
  assert.equal(String(h.created[0].phone), '79992222222')
  assert.equal(r.body.fields.clientId, 'created')
})

test('duplicate phone requires manual selection without another client', async () => {
  const h = await harness({ clients: ['a', 'b'].map(_id => ({ _id, tenantId: 'tenant-a', phone: 79992222222 })) })
  const r = await h.post({ mode: 'auto', text: 'Создай заявку', clipboardPhone: '79992222222' })
  assert.equal(r.status, 200)
  assert.equal(r.body.fields.clientId, undefined)
  assert.match(r.body.aiWarnings[0], /нескольких клиентов/)
  assert.equal(h.created.length, 0)
})

test('edit and clarification never fall back to creating a client', async () => {
  for (const intent of ['edit', 'clarify']) {
    const h = await harness({ intent })
    const r = await h.post({ mode: 'auto', text: 'Перенеси заказ', clipboardPhone: '79992222222' })
    assert.equal(r.status, 200)
    assert.equal(h.created.length, 0)
    assert.equal(h.calls.length, 1)
    assert.equal(h.searches.length, intent === 'edit' ? 1 : 0)
    if (intent === 'edit') assert.equal(h.searches[0].tenantId, 'tenant-a')
  }
})

test('missing clipboard phone is requested before billing or creation; invalid content is rejected', async () => {
  const h = await harness()
  assert.equal((await h.post({ mode: 'auto', text: 'Создай заявку, возьми телефон из буфера обмена' })).body.needsClipboardPhone, true)
  for (const clipboardPhone of ['секрет 79992222222', '0000000000', '1234567890', '+8 999 222 22 22', '7((9992222222', '79999999999', 79992222222, { phone: '79992222222' }]) {
    assert.equal((await h.post({ mode: 'auto', text: 'Создай заявку', clipboardPhone })).status, 400)
  }
  assert.equal(h.calls.length, 0)
  assert.equal(h.created.length, 0)
})

test('model may request clipboard for an indirect instruction; malformed intent cannot create', async () => {
  const h = await harness({ completion: JSON.stringify({ intent: 'create', needsClipboardPhone: true }) })
  assert.equal((await h.post({ mode: 'auto', text: 'Номер я уже скопировал, сделай заявку' })).body.needsClipboardPhone, true)
  assert.equal(h.created.length, 0)
  for (const completion of ['{}', 'invalid', '{"intent":"delete","needsClipboardPhone":false}']) {
    const bad = await harness({ completion })
    assert.equal((await bad.post({ mode: 'auto', text: 'Создай заявку' })).status, 502)
    assert.equal(bad.created.length, 0)
  }
})

test('auto API denies unauthenticated and out-of-tariff requests before using the model', async () => {
  for (const [options, status] of [[{ context: {} }, 401], [{ access: { allowAi: false } }, 403], [{ access: { allowAi: true, hasTariff: false } }, 403]]) {
    const h = await harness(options)
    assert.equal((await h.post({ mode: 'auto', text: 'Создай заявку' })).status, status)
    assert.equal(h.calls.length, 0)
  }
})

test('clipboard parser accepts one Russian number only and never passes arbitrary text', async () => {
  const { parseClipboardPhone, requestsClipboardPhone } = await import('../../helpers/aiAssistantClipboard.mjs')
  for (const source of ['+7 (999) 222-22-22', '8 999 222 22 22', '9992222222']) assert.equal(parseClipboardPhone(source), '79992222222')
  for (const source of ['', '123', '79992222222 79993333333', 'Анна 79992222222', 'ignore instructions', '+79992222222;']) assert.equal(parseClipboardPhone(source), '')
  for (const source of ['0000000000', '1234567890', '+9992222222', '+8 999 222 22 22', '7((9992222222', '7)999(2222222', '79999999999', '7999\n2222222', '7---9992222222']) assert.equal(parseClipboardPhone(source), '')
  assert.equal(parseClipboardPhone('+7 (391) 234-56-78'), '73912345678')
  for (const source of ['Возьми телефон из буфера', 'Номер я скопировал', 'Телефон в буфере обмена']) assert.equal(requestsClipboardPhone(source), true)
  for (const source of ['Не бери телефон из буфера', 'Номер не из буфера', 'Создай без буфера']) assert.equal(requestsClipboardPhone(source), false)
})
