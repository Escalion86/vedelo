import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_APP_URL,
  getMaxContactAction,
  isValidMaxContact,
  normalizeMaxContactInput,
} from './maxContact.js'

test('нормализует российский телефон для MAX', () => {
  assert.equal(normalizeMaxContactInput('8 (999) 123-45-67'), '+79991234567')
  assert.equal(normalizeMaxContactInput('9991234567'), '+79991234567')
})

test('нормализует ссылку на контакт MAX', () => {
  assert.equal(
    normalizeMaxContactInput('max.ru/u/example?from=crm'),
    'https://max.ru/u/example?from=crm'
  )
  assert.deepEqual(getMaxContactAction('https://www.max.ru/example'), {
    type: 'link',
    url: 'https://max.ru/example',
    label: 'https://max.ru/example',
  })
})

test('для телефона возвращает копирование и запуск приложения MAX', () => {
  assert.equal(MAX_APP_URL, 'max://max.ru/')
  assert.deepEqual(getMaxContactAction('+7 999 123-45-67'), {
    type: 'phone',
    url: MAX_APP_URL,
    phone: '+79991234567',
    label: '+79991234567',
  })
})

test('не принимает произвольные ссылки и главную страницу MAX', () => {
  assert.equal(isValidMaxContact('https://example.com/user'), false)
  assert.equal(isValidMaxContact('javascript:alert(1)'), false)
  assert.equal(isValidMaxContact('https://max.ru/'), false)
  assert.equal(getMaxContactAction('https://example.com/user'), null)
})
