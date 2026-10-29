import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTelegramInput, normalizeTelegramPhoneInput } from './socialInput.js'

test('Telegram paste keeps the complete Russian phone', () => {
  for (const value of ['+7(913) 833-56-01', '+79138335601', '8 (913) 833-56-01', '9138335601', '+7\u00a0(913)\u202f833–56–01']) {
    assert.equal(normalizeTelegramInput(value), '+79138335601')
    assert.equal(normalizeTelegramPhoneInput(value), '+79138335601')
  }
})

test('Telegram usernames and profile links keep their existing normalization', () => {
  for (const value of ['@client_name', 'https://t.me/client_name', 'client_name extra text']) {
    assert.equal(normalizeTelegramInput(value), 'client_name')
    assert.equal(normalizeTelegramPhoneInput(value), '')
  }
  for (const value of ['', '+7(913)', '+441234567890', '12345', 'name 79138335601', '79138335601 79138335602'])
    assert.equal(normalizeTelegramPhoneInput(value), '')
})
