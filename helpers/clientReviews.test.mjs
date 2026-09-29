import test from 'node:test'
import assert from 'node:assert/strict'
import { getUserTariffAccess } from './tariffAccess.js'
import {
  canRequestClientReview,
  validateReviewAnswer,
} from './clientReviews.mjs'

test('Отзывы требуют явного флага тарифа, включая trial; просроченный offer не даёт доступ', () => {
  const user = {
    tariffId: 't',
    trialEndsAt: new Date(Date.now() + 60000).toISOString(),
  }
  for (const value of [undefined, null, false, 'true'])
    assert.equal(
      getUserTariffAccess(user, [
        { _id: 't', allowDocuments: true, allowClientReviews: value },
      ]).allowClientReviews,
      false
    )
  assert.equal(
    getUserTariffAccess(user, [{ _id: 't', allowClientReviews: true }])
      .allowClientReviews,
    true
  )
  assert.equal(
    getUserTariffAccess(
      {
        ...user,
        registrationOffer: { tariffId: 't', endsAt: new Date(0).toISOString() },
      },
      [{ _id: 't', allowClientReviews: true }]
    ).allowClientReviews,
    false
  )
  assert.equal(getUserTariffAccess({}, []).allowClientReviews, false)
})
test('Завершение работы учитывает конец и статус, но не оплату', () => {
  const event = {
    clientId: 'c',
    status: 'active',
    eventDate: '2026-01-01',
    dateEnd: '2026-01-03',
    contractSum: 1000,
  }
  assert.equal(canRequestClientReview(event, Date.parse('2026-01-02')), false)
  assert.equal(canRequestClientReview(event, Date.parse('2026-01-04')), true)
  for (const status of ['draft', 'canceled'])
    assert.equal(canRequestClientReview({ ...event, status }), false)
  assert.equal(canRequestClientReview({ ...event, isDemo: true }), false)
  assert.equal(canRequestClientReview({ ...event, status: 'closed' }), true)
})
test('Оценка обязательна, комментарий ограничен и не принимает Mongo-операторы', () => {
  for (const rating of [undefined, 0, 6, 2.5, '5', { $gt: 0 }])
    assert.ok(validateReviewAnswer({ rating }))
  assert.ok(validateReviewAnswer({ rating: 5, comment: { $set: 'x' } }))
  assert.ok(validateReviewAnswer({ rating: 5, comment: 'x'.repeat(2001) }))
  assert.equal(validateReviewAnswer({ rating: 5 }), '')
})
