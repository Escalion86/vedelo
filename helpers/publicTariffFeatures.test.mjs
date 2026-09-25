import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVisibleTariffFeatureRows,
  isPublicTariffFeatureAvailable,
} from './publicTariffFeatures.mjs'

const featureRows = [
  { label: 'Базовая функция', included: true },
  { label: 'Лимит', type: 'eventsLimit' },
  { label: 'Документы', key: 'allowDocuments' },
  { label: 'Коммерческие предложения', key: 'allowProposals' },
]

test('скрывает функцию, которой нет ни в одном видимом тарифе', () => {
  const rows = getVisibleTariffFeatureRows(featureRows, [
    { allowDocuments: false, allowProposals: false },
    { allowDocuments: true, allowProposals: false },
  ])

  assert.deepEqual(
    rows.map((row) => row.label),
    ['Базовая функция', 'Лимит', 'Документы']
  )
})

test('старые тарифы показывают предложения по доступу к документам, явный запрет сохраняется', () => {
  const feature = { key: 'allowProposals' }
  assert.equal(
    isPublicTariffFeatureAvailable({ allowDocuments: true }, feature),
    true
  )
  assert.equal(
    isPublicTariffFeatureAvailable(
      { allowDocuments: true, allowProposals: false },
      feature
    ),
    false
  )
  assert.equal(
    isPublicTariffFeatureAvailable(
      { allowDocuments: false, allowProposals: true },
      feature
    ),
    true
  )
  assert.ok(
    getVisibleTariffFeatureRows(featureRows, [{ allowDocuments: true }]).some(
      (row) => row.key === 'allowProposals'
    )
  )
  assert.equal(
    isPublicTariffFeatureAvailable({}, { key: 'allowTelegramIntegration' }),
    false
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
