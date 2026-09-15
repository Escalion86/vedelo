import assert from 'node:assert/strict'
import test from 'node:test'
import { YANDEX_METRIKA_ID, isAnalyticsHost } from './metrikaConfig.mjs'

test('новый счётчик Метрики используется по умолчанию', () => {
  assert.equal(YANDEX_METRIKA_ID, 112668604)
})

test('Метрика ограничена новым доменом и локальной проверкой', () => {
  assert.equal(isAnalyticsHost('vedelo.ru'), true)
  assert.equal(isAnalyticsHost('www.vedelo.ru'), true)
  assert.equal(isAnalyticsHost('localhost'), true)
  assert.equal(isAnalyticsHost('artistcrm.ru'), false)
})
