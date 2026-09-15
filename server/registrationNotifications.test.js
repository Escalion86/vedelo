import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNewUserRegistrationPush } from './registrationNotificationCore.js'

test('registration push contains safe phone registration details and users link', () => {
  const payload = buildNewUserRegistrationPush({
    _id: 'user-1',
    registrationType: 'phone',
    registrationSource: 'focusnik-pilot',
    phone: '79990000000',
  })

  assert.equal(payload.title, 'Новый пользователь Ведело')
  assert.equal(payload.body, 'Регистрация по телефону. Источник: focusnik-pilot')
  assert.equal(payload.data.type, 'new_user_registration')
  assert.equal(payload.data.userId, 'user-1')
  assert.equal(payload.data.url, '/cabinet/users')
  assert.equal(payload.body.includes('79990000000'), false)
})

test('registration push labels VK ID and does not require a source', () => {
  const payload = buildNewUserRegistrationPush({
    _id: 'user-2',
    registrationType: 'vk',
  })

  assert.equal(payload.body, 'Регистрация через VK ID')
  assert.equal(payload.tag, 'new-user-user-2')
})
