const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBindings } = require('next/dist/build/swc')
const { loader, chain } = require('./stageFLoader.cjs')

test.before(() => loadBindings())
const tenantId = 'a'.repeat(24)
const otherTenant = 'b'.repeat(24)
const clientId = 'c'.repeat(24)
const now = Date.parse('2026-11-05T05:00:00Z')

function fixture(context = { tenantId, access: { allowClientReviews: true } }) {
  const rows = [
    { _id: 'expired', expiresAt: new Date(now - 1) },
    { _id: 'sent', expiresAt: new Date(now - 1), sentAt: new Date(now - 100) },
    { _id: 'boundary', expiresAt: new Date(now) },
    {
      _id: 'received',
      expiresAt: new Date(now - 1),
      submittedAt: new Date(now - 100),
      rating: 3,
    },
    {
      _id: 'revoked',
      expiresAt: new Date(now - 1),
      revokedAt: new Date(now - 100),
    },
    { _id: 'future', expiresAt: new Date(now + 1) },
    { _id: 'foreign', expiresAt: new Date(now - 1), tenantId: otherTenant },
  ].map((row) => ({
    tenantId,
    clientId,
    createdAt: new Date(now - 1000),
    ...row,
  }))
  const calls = []
  const matches = (row, filter) =>
    Object.entries(filter).every(([key, value]) => {
      if (key === '$and')
        return value.every((condition) => matches(row, condition))
      if (value === null) return row[key] == null
      if (typeof value !== 'object') return row[key] === value
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === '$lte') return row[key] <= expected
        if (operator === '$gte') return row[key] >= expected
        if (operator === '$lt') return row[key] < expected
        if (operator === '$ne') return row[key] != expected
        throw new Error(`Unexpected operator ${operator}`)
      })
    })
  const load = loader({
    '@server/clientReviews': {
      reviewContext: async () => context,
      reviewResponse: (data) => ({ status: 200, data }),
      reviewError: (error) => ({ status: 400, error }),
      reviewDto: (row) => ({ _id: row._id }),
      validReviewId: (id) => /^[a-f0-9]{24}$/i.test(id),
    },
    '@models/ClientReviews': {
      find: (filter) => {
        calls.push(['find', filter])
        return chain(rows.filter((row) => matches(row, filter)))
      },
      countDocuments: async (filter) => {
        calls.push(['count', filter])
        return rows.filter((row) => matches(row, filter)).length
      },
    },
    '@models/Clients': { find: () => chain([]) },
    '@models/Events': { find: () => chain([]) },
  })
  return { GET: load('app/api/client-reviews/route.js').GET, calls }
}

test('Истёкшие: только запросы без ответа и отзыва ссылки, включая границу срока, только свой tenant', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now })
  const { GET, calls } = fixture()
  const result = await GET({
    url:
      'https://example.invalid/api/client-reviews?status=expired&tenantId=' +
      otherTenant,
  })
  assert.equal(result.status, 200)
  assert.deepEqual(
    result.data.items.map((row) => row._id),
    ['expired', 'sent', 'boundary']
  )
  assert.equal(result.data.total, 3)
  assert.equal(calls.length, 2)
  for (const [, filter] of calls) {
    assert.equal(filter.tenantId, tenantId)
    assert.equal(filter.$and[0].submittedAt, null)
    assert.equal(filter.$and[0].revokedAt, null)
    assert.equal(filter.$and[0].expiresAt.$lte.getTime(), now)
  }
})

test('Истёкшие сочетаются с клиентом, оценкой, периодом и непрочитанными', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now })
  const { GET, calls } = fixture()
  const result = await GET({
    url: `https://example.invalid/api/client-reviews?status=expired&clientId=${clientId}&rating=3&from=2026-11-01&to=2026-11-05`,
  })
  assert.equal(result.data.total, 0)
  assert.equal(calls[0][1].clientId, clientId)
  assert.equal(calls[0][1].rating, 3)
  assert.ok(calls[0][1].createdAt.$gte)
  assert.ok(calls[0][1].createdAt.$lt)
  const unread = await GET({
    url: 'https://example.invalid/api/client-reviews?status=expired&unread=true',
  })
  assert.equal(unread.data.total, 0)
})

test('Неизвестные статусы отвергаются до чтения БД; доступ без сессии запрещён', async () => {
  for (const status of ['unknown', '', '%7B%22%24ne%22%3Anull%7D']) {
    const { GET, calls } = fixture()
    assert.equal(
      (
        await GET({
          url: `https://example.invalid/api/client-reviews?status=${status}`,
        })
      ).status,
      400
    )
    assert.equal(calls.length, 0)
  }
  const { GET, calls } = fixture({ response: { status: 401 } })
  assert.equal(
    (
      await GET({
        url: 'https://example.invalid/api/client-reviews?status=expired',
      })
    ).status,
    401
  )
  assert.equal(calls.length, 0)
})
