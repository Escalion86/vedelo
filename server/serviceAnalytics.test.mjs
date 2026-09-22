import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyticsRange,
  analyticsAccessStatus,
  summarizeAnalytics,
} from './serviceAnalytics.mjs'

test('access: anonymous, missing tenant, ordinary user and admin cannot read cross-tenant analytics', () => {
  assert.equal(analyticsAccessStatus(null), 401)
  assert.equal(analyticsAccessStatus({ user: { _id: 'a', role: 'dev' } }), 401)
  for (const role of ['user', 'admin', 'manager'])
    assert.equal(
      analyticsAccessStatus({ user: { _id: 'a', role }, tenantId: 'other' }),
      403
    )
  assert.equal(
    analyticsAccessStatus({ user: { _id: 'a', role: 'dev' }, tenantId: 'own' }),
    200
  )
})

test('date boundaries, equal elapsed comparison and invalid inputs', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const range = analyticsRange(
    new URLSearchParams({ from: '2026-09-17', to: '2026-09-23' }),
    now
  )
  assert.equal(range.days, 7)
  assert.equal(range.previousStart.toISOString(), '2026-09-10T00:00:00.000Z')
  assert.equal(range.previousEnd.toISOString(), '2026-09-16T12:00:00.000Z')
  assert.equal(
    +range.end - +range.from,
    +range.previousEnd - +range.previousStart
  )
  for (const args of [
    { from: '2026-02-30' },
    { from: '2020-01-01' },
    { from: '2026-09-23', to: '2026-09-22' },
    { to: '2026-09-24' },
    { exclude: '$ne' },
  ])
    assert.throws(() => analyticsRange(new URLSearchParams(args), now))
})

test('receipts are not doubled by balance charges; bonuses excluded; first and repeated payments separated', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const range = analyticsRange(
    new URLSearchParams({
      from: '2026-08-01',
      to: '2026-08-31',
      exclude: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    }),
    now
  )
  const user = { _id: 'u', createdAt: '2026-08-01T00:00:00Z', role: 'user' }
  const groups = [
    ['receipts', 1000, 2],
    ['tariffs', 500, 1],
    ['bonuses', 100, 1],
    ['refunds', 100, 1],
  ].map(([category, amount, count]) => ({
    _id: {
      userId: 'u',
      period: 'current',
      day: '2026-08-05',
      category,
      status: 'succeeded',
    },
    amount,
    count,
  }))
  groups.push({
    _id: {
      userId: 'admin',
      period: 'current',
      day: '2026-08-05',
      category: 'receipts',
      status: 'succeeded',
    },
    amount: 99999,
    count: 1,
  })
  const result = summarizeAnalytics({
    users: [
      user,
      { ...user, _id: 'admin', role: 'admin' },
      { ...user, _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    ],
    groups,
    firstPayments: [{ _id: 'u', at: '2026-08-05T00:00:00Z' }],
    tariffs: [],
    range,
    now,
  })
  assert.equal(result.current.receipts, 1000)
  assert.equal(result.current.tariffs, 500)
  assert.equal(result.current.payers, 1)
  assert.equal(result.current.firstPayers, 1)
  assert.equal(result.current.repeatPayments, 1)
  assert.equal(result.current.registrations, 1)
  assert.equal(result.current.conversion, 100)
  assert.equal(result.sources[0].source, 'Без источника')
  assert.equal(result.daily.length, 31)
  assert.equal(
    result.daily.reduce((n, row) => n + row.receipts, 0),
    1000
  )
})

test('immature cohorts do not turn into zero conversion; prior payer is not new', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const range = analyticsRange(
    new URLSearchParams({ from: '2026-09-01', to: '2026-09-23' }),
    now
  )
  const result = summarizeAnalytics({
    users: [{ _id: 'u', role: 'user', createdAt: '2026-09-02' }],
    firstPayments: [{ _id: 'u', at: '2026-08-01' }],
    tariffs: [],
    groups: [
      {
        _id: {
          userId: 'u',
          period: 'current',
          category: 'receipts',
          day: '2026-09-05',
          status: 'succeeded',
        },
        amount: 300,
        count: 1,
      },
    ],
    range,
    now,
  })
  assert.equal(result.current.conversion, null)
  assert.equal(result.current.firstPayers, 0)
  assert.equal(result.current.repeatPayments, 1)
})

test('assigned free tariff and legacy trial are retained without claiming payment', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const range = analyticsRange(new URLSearchParams(), now)
  const result = summarizeAnalytics({
    users: [
      { _id: 'free', role: 'user', tariffId: 'free', createdAt: now },
      { _id: 'trial', role: 'user', trialEndsAt: '2026-10-01', createdAt: now },
    ],
    groups: [],
    firstPayments: [],
    tariffs: [{ _id: 'free', title: 'Бесплатный' }],
    range,
    now,
  })
  assert.equal(
    result.distribution.find((r) => r.title === 'Бесплатный').total,
    1
  )
  assert.equal(
    result.distribution.find((r) => r.title === 'Пробный доступ без тарифа')
      .trial,
    1
  )
  assert.equal(result.current.receipts, 0)
})
