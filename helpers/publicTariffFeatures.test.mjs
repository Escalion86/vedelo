import assert from 'node:assert/strict'
import test from 'node:test'
import { getVisibleTariffFeatureRows } from './publicTariffFeatures.mjs'

const featureRows = [
  { label: 'Базовая функция', included: true },
  { label: 'Лимит', type: 'eventsLimit' },
  { label: 'Документы', key: 'allowDocuments' },
  { label: 'Коммерческие предложения', key: 'allowProposals' },
]

test('скрывает функцию, которой нет ни в одном видимом тарифе', () => {
  const rows = getVisibleTariffFeatureRows(featureRows, [
    { allowDocuments: false, allowProposals: false },
    { allowDocuments: true },
  ])

  assert.deepEqual(
    rows.map((row) => row.label),
    ['Базовая функция', 'Лимит', 'Документы']
  )
})

test('показывает функцию, доступную хотя бы в одном видимом тарифе', () => {
  const rows = getVisibleTariffFeatureRows(featureRows, [
    { allowProposals: false },
    { allowProposals: true },
  ])

  assert.equal(
    rows.some((row) => row.key === 'allowProposals'),
    true
  )
})

test('базовые и количественные строки остаются без публичных тарифов', () => {
  const rows = getVisibleTariffFeatureRows(featureRows, [])

  assert.deepEqual(
    rows.map((row) => row.label),
    ['Базовая функция', 'Лимит']
  )
})
