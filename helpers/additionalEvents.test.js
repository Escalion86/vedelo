import test from 'node:test'
import assert from 'node:assert/strict'

import { getAdditionalEventsDisplayGroups, isWaitingForDeposit, getWaitingDepositEvents, getSoonNoDepositEvents } from './additionalEvents.js'

test('deposit reminders include future dates and drafts, exclude actual payments and closed work', () => {
  const event = { _id: 'event', status: 'active', waitDeposit: true, depositDueAt: '2026-10-22T12:00:00Z' }
  const payment = { eventId: 'event', type: 'income', category: 'deposit', amount: 15000, paymentMethod: 'transfer' }
  assert.equal(isWaitingForDeposit(event), true)
  assert.equal(isWaitingForDeposit(event, [payment]), false)
  assert.equal(isWaitingForDeposit(event, [{ ...payment, paymentMethod: 'obligation' }]), true)
  assert.equal(isWaitingForDeposit(event, [{ ...payment, category: 'advance' }]), false)
  assert.equal(isWaitingForDeposit(event, [{ ...payment, eventId: 'other' }]), true)
  assert.equal(isWaitingForDeposit({ ...event, status: 'closed' }), false)
  assert.equal(isWaitingForDeposit({ ...event, status: 'canceled' }), false)
  assert.equal(getWaitingDepositEvents([{ ...event, status: 'draft' }]).length, 1)
  assert.equal(getSoonNoDepositEvents([event], [], new Date('2026-10-21')).length, 0)
  assert.equal(getSoonNoDepositEvents([{ ...event, status: 'draft' }], [], new Date('2026-10-23')).length, 1)
  assert.equal(isWaitingForDeposit({ ...event, status: 'draft' }, [payment]), true, 'partial draft confirmation remains reachable')
})

test('getAdditionalEventsDisplayGroups sorts events by date and keeps original indexes', () => {
  const now = new Date('2026-06-22T12:00:00+07:00')
  const groups = getAdditionalEventsDisplayGroups(
    [
      { title: 'Later', date: '2026-06-25T10:00:00+07:00' },
      { title: 'Tomorrow late', date: '2026-06-23T18:00:00+07:00' },
      { title: 'Overdue', date: '2026-06-22T10:00:00+07:00' },
      { title: 'Today', date: '2026-06-22T14:00:00+07:00' },
      { title: 'No date' },
      { title: 'Tomorrow early', date: '2026-06-23T09:00:00+07:00' },
    ],
    now
  )

  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.map((item) => ({
        title: item.title,
        originalIndex: item.originalIndex,
      })),
    })),
    [
      {
        key: 'overdue',
        label: 'Просрочено',
        items: [{ title: 'Overdue', originalIndex: 2 }],
      },
      {
        key: 'today',
        label: 'Сегодня',
        items: [{ title: 'Today', originalIndex: 3 }],
      },
      {
        key: 'tomorrow',
        label: 'Завтра',
        items: [
          { title: 'Tomorrow early', originalIndex: 5 },
          { title: 'Tomorrow late', originalIndex: 1 },
        ],
      },
      {
        key: 'later',
        label: 'Позднее',
        items: [{ title: 'Later', originalIndex: 0 }],
      },
      {
        key: 'withoutDate',
        label: 'Без даты',
        items: [{ title: 'No date', originalIndex: 4 }],
      },
    ]
  )
})

test('getAdditionalEventsDisplayGroups moves done events to completed group with done date', () => {
  const now = new Date('2026-06-22T12:00:00+07:00')
  const groups = getAdditionalEventsDisplayGroups(
    [
      {
        title: 'Completed overdue',
        date: '2026-06-20T10:00:00+07:00',
        done: true,
        doneAt: '2026-06-22T11:30:00+07:00',
      },
      { title: 'Overdue active', date: '2026-06-22T10:00:00+07:00' },
    ],
    now
  )

  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.map((item) => ({
        title: item.title,
        originalIndex: item.originalIndex,
        displayDate: item.displayDate,
      })),
    })),
    [
      {
        key: 'overdue',
        label: 'Просрочено',
        items: [
          {
            title: 'Overdue active',
            originalIndex: 1,
            displayDate: '2026-06-22T10:00:00+07:00',
          },
        ],
      },
      {
        key: 'completed',
        label: 'Выполненные',
        items: [
          {
            title: 'Completed overdue',
            originalIndex: 0,
            displayDate: '2026-06-22T11:30:00+07:00',
          },
        ],
      },
    ]
  )
})
