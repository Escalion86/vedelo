import test from 'node:test'
import assert from 'node:assert/strict'
import { getLearningAccess } from './learningAccess.mjs'
import { getLearningArticles } from './learningCatalog.mjs'

const docs = { requiredFeature: 'allowDocuments' }
const tariffs = [
  {
    _id: 'pro',
    title: 'Профи',
    price: 900,
    allowDocuments: true,
    allowCalendarSync: true,
    allowAi: true,
  },
  {
    _id: 'hidden',
    title: 'Служебный',
    price: 0,
    hidden: true,
    allowDocuments: true,
  },
  { _id: 'base', title: 'Базовый', price: 0 },
  {
    _id: 'plus',
    title: 'Плюс',
    price: 400,
    allowDocuments: true,
    allowCalendarSync: true,
  },
]
const base = { tariffId: 'base' }
test('earliest visible supporting tariff, sorted by price; available feature needs no badge', () => {
  assert.deepEqual(getLearningAccess(docs, base, tariffs), {
    available: false,
    label: 'Доступно с тарифа «Плюс»',
  })
  assert.deepEqual(getLearningAccess(docs, { tariffId: 'plus' }, tariffs), {
    available: true,
    label: null,
  })
  assert.deepEqual(getLearningAccess({}, base, tariffs), {
    available: true,
    label: null,
  })
  assert.equal(tariffs[0]._id, 'pro', 'sorting must not mutate shared tariffs')
})
test('more expensive does not imply inclusion; unknown/hidden-only plans never invent names', () => {
  const custom = [
    ...tariffs,
    { _id: 'custom', title: 'Особый', price: 1200, allowDocuments: false },
  ]
  assert.equal(
    getLearningAccess(docs, base, custom).label,
    'Доступно на тарифе «Плюс»'
  )
  for (const options of [[], tariffs.filter((t) => t._id === 'hidden')]) {
    assert.deepEqual(getLearningAccess(docs, base, options), {
      available: false,
      label: 'Недоступно на текущем тарифе',
    })
  }
  assert.equal(
    getLearningAccess(docs, { tariffId: 'hidden' }, tariffs).available,
    true
  )
})
test('unrestricted trial uses existing access rules; registration offer does not grant disabled features', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  assert.equal(
    getLearningAccess(docs, { ...base, trialEndsAt: future }, tariffs)
      .available,
    true
  )
  assert.equal(
    getLearningAccess(
      { requiredFeature: 'allowAi' },
      { ...base, trialEndsAt: future },
      tariffs
    ).available,
    false
  )
  assert.equal(
    getLearningAccess(
      docs,
      {
        ...base,
        trialEndsAt: future,
        registrationOffer: { tariffId: 'base', endsAt: future },
      },
      tariffs
    ).available,
    false
  )
  assert.equal(
    getLearningAccess(
      docs,
      {
        tariffId: 'plus',
        registrationOffer: { tariffId: 'plus', endsAt: past },
      },
      tariffs
    ).available,
    false
  )
})
test('catalog flags match feature gates including AI file import; all lessons retained', () => {
  const articles = getLearningArticles()
  assert.equal(articles.length, 10)
  const unavailable = articles
    .filter((article) => !getLearningAccess(article, base, tariffs).available)
    .map((a) => a.id)
  assert.deepEqual(unavailable, [
    'attachments',
    'document-templates',
    'calendar',
    'import',
  ])
  assert.equal(
    getLearningAccess(
      articles.find((a) => a.id === 'import'),
      base,
      tariffs
    ).label,
    'Доступно с тарифа «Профи»'
  )
})
