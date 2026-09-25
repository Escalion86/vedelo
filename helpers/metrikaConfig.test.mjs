import assert from 'node:assert/strict'
import test from 'node:test'
import {
  YANDEX_METRIKA_ID,
  isAnalyticsHost,
  isPublicAnalyticsPath,
} from './metrikaConfig.mjs'

test('новый счётчик Метрики используется по умолчанию', () => {
  assert.equal(YANDEX_METRIKA_ID, 112668604)
})

test('Метрика ограничена новым доменом и локальной проверкой', () => {
  assert.equal(isAnalyticsHost('vedelo.ru'), true)
  assert.equal(isAnalyticsHost('www.vedelo.ru'), true)
  assert.equal(isAnalyticsHost('localhost'), true)
  assert.equal(isAnalyticsHost('artistcrm.ru'), false)
})

test('Метрика без согласия ограничена маркетингом и регистрацией', () => {
  assert.equal(isPublicAnalyticsPath('/'), true)
  assert.equal(isPublicAnalyticsPath('/crm-dlya-muzykantov'), true)
  assert.equal(isPublicAnalyticsPath('/crm-s-google-calendar'), true)
  assert.equal(isPublicAnalyticsPath('/kak-vesti-zayavki-fokusniku'), true)
  assert.equal(isPublicAnalyticsPath('/login?mode=register'), true)
  assert.equal(isPublicAnalyticsPath('/cabinet/eventsUpcoming'), false)
  assert.equal(isPublicAnalyticsPath('/event/123'), false)
  assert.equal(isPublicAnalyticsPath('/privacy'), false)
})
