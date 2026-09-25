import test from 'node:test'
import assert from 'node:assert/strict'
import { getRequestsWithoutNextStep } from './additionalEvents.js'

test('заявки без даты работы и с прошедшей датой требуют следующего шага', () => {
  const rows = [
    { _id: 'new', status: 'draft', createdAt: '2026-09-25' },
    {
      _id: 'old',
      status: 'draft',
      createdAt: '2026-08-01',
      eventDate: '2026-08-02',
    },
    ...['active', 'closed', 'canceled'].map((status) => ({
      _id: status,
      status,
    })),
  ]
  assert.deepEqual(
    getRequestsWithoutNextStep(rows).map((row) => row._id),
    ['old', 'new']
  )
  assert.equal(rows[0]._id, 'new')
})

test('выполненные и недатированные задачи не заменяют следующий шаг; просроченные не дублируются', () => {
  const rows = [
    { _id: 'done', additionalEvents: [{ date: '2026-10-01', done: true }] },
    { _id: 'undated', additionalEvents: [{ title: 'Позвонить' }, null] },
    { _id: 'invalid', additionalEvents: [{ date: 'invalid' }] },
    { _id: 'overdue', additionalEvents: [{ date: '2020-01-01' }] },
    { _id: 'future', additionalEvents: [{ date: '2099-01-01', done: false }] },
  ].map((row) => ({ ...row, status: 'draft' }))
  assert.deepEqual(
    getRequestsWithoutNextStep(rows).map((row) => row._id),
    ['done', 'undated', 'invalid']
  )
  const updated = {
    ...rows[0],
    additionalEvents: [
      ...rows[0].additionalEvents,
      { date: '2099-01-01', done: false },
    ],
  }
  assert.equal(getRequestsWithoutNextStep([updated]).length, 0)
  assert.deepEqual(getRequestsWithoutNextStep(null), [])
})
