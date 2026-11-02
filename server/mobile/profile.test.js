import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeMobileProfilePatch,
  serializeMobileProfile,
} from './profile.js'

test('mobile profile нормализует контакты и игнорирует служебные поля', () => {
  const result = normalizeMobileProfilePatch({
    firstName: '  Анна  ',
    email: ' USER@EXAMPLE.COM ',
    whatsapp: '+7 (900) 000-00-01',
    telegram: 'https://t.me/artist_name/',
    vk: '@artist_vk',
    tenantId: 'another-tenant',
    password: 'must-not-change',
  })
  assert.equal(result.error, '')
  assert.deepEqual(result.update, {
    firstName: 'Анна',
    email: 'user@example.com',
    whatsapp: 79000000001,
    telegram: 'artist_name',
    vk: 'artist_vk',
  })
  assert.equal('tenantId' in result.update, false)
  assert.equal('password' in result.update, false)
})

test('mobile profile serializer возвращает контакты без password и OAuth данных', () => {
  const result = serializeMobileProfile({
    _id: 'user-id',
    tenantId: 'tenant-id',
    firstName: 'Анна',
    whatsapp: 79000000001,
    telegram: 'artist',
    password: 'hash',
    yandexId: 'provider-identity',
    googleCalendar: { refreshToken: 'oauth-secret' },
    registrationOffer: {
      tariffId: 'tariff-id',
      tariffTitle: 'Профи',
      endsAt: '2026-08-20T00:00:00.000Z',
      welcomeMessage: 'Добро пожаловать',
      featureKeys: ['allowDocuments'],
      featureLabels: ['Документы и шаблоны'],
    },
  }, {
    _id: 'tariff-id',
    title: 'Профи',
    price: 999,
  })
  assert.equal(result.whatsapp, '79000000001')
  assert.equal(result.telegram, 'artist')
  assert.equal(result.yandexLinked, true)
  assert.equal('yandexId' in result, false)
  assert.equal(result.tariffId, 'tariff-id')
  assert.equal(result.tariffTitle, 'Профи')
  assert.equal(result.registrationOffer.tariffTitle, 'Профи')
  assert.deepEqual(result.registrationOffer.featureKeys, ['allowDocuments'])
  const json = JSON.stringify(result)
  assert.equal(json.includes('hash'), false)
  assert.equal(json.includes('oauth-secret'), false)
  assert.equal(json.includes('999'), false)
})
test('mobile profile preserves a combined name longer than the former first-name limit', () => {
  const fullName = `${'А'.repeat(70)} ${'Б'.repeat(70)} ${'В'.repeat(70)}`
  const result = normalizeMobileProfilePatch({ firstName: fullName, secondName: '', thirdName: '' })
  assert.equal(result.update.firstName, fullName)
  assert.equal(result.update.secondName, '')
})
