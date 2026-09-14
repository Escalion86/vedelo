import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWorkItemTemplateVariables,
  replaceWorkItemTerms,
  resolvePrimaryEntityMode,
  resolveWorkItemTerminology,
} from './workItemTerminology.mjs'

test('auto keeps events for the events preset', () => {
  const settings = { custom: { onboardingActivityPreset: 'events' } }
  assert.equal(resolvePrimaryEntityMode(settings), 'events')
  assert.equal(resolveWorkItemTerminology(settings).pluralCapitalized, 'Мероприятия')
})

test('auto uses orders for every other known preset', () => {
  const settings = { custom: { onboardingActivityPreset: 'consulting' } }
  assert.equal(resolvePrimaryEntityMode(settings), 'orders')
  assert.equal(resolveWorkItemTerminology(settings).pluralGenitive, 'заказов')
})

test('auto safely falls back to events for missing and unknown presets', () => {
  assert.equal(resolvePrimaryEntityMode({}), 'events')
  assert.equal(
    resolvePrimaryEntityMode({ custom: { onboardingActivityPreset: 'unknown' } }),
    'events'
  )
})

test('manual terminology has priority over specialization', () => {
  assert.equal(
    resolvePrimaryEntityMode({
      custom: {
        onboardingActivityPreset: 'events',
        primaryEntityTerminology: 'orders',
      },
    }),
    'orders'
  )
  assert.equal(
    resolvePrimaryEntityMode({
      custom: {
        onboardingActivityPreset: 'repair_home',
        primaryEntityTerminology: 'events',
      },
    }),
    'events'
  )
})

test('exposes custom DOCX variables and readable server messages', () => {
  const settings = { custom: { primaryEntityTerminology: 'orders' } }
  assert.deepEqual(getWorkItemTemplateVariables(settings), {
    workItemLabel: 'заказ',
    workItemLabelGenitive: 'заказа',
    workItemLabelPlural: 'заказы',
    workItemLabelPluralGenitive: 'заказов',
  })
  assert.equal(replaceWorkItemTerms('Мероприятие не найдено', settings), 'Заказ не найден')
  assert.equal(
    replaceWorkItemTerms('Подготовить смету мероприятия и порядок на мероприятии', settings),
    'Подготовить смету заказа и порядок при выполнении заказа'
  )
})
