import test from 'node:test'
import assert from 'node:assert/strict'
import { resetClientMessengerAvailability } from './clientMessengerAvailability.js'

test('resets Telegram phone availability when client phone changes', () => {
  assert.deepEqual(
    resetClientMessengerAvailability(
      {
        phone: 79991234567,
        telegram: '',
        telegramPhone: 79991234567,
        telegramPhoneUnavailable: true,
      },
      { phone: 79997654321 }
    ),
    {
      phone: 79997654321,
      telegramPhone: null,
      maxPhoneUnavailable: false,
      telegramPhoneUnavailable: false,
    }
  )
})

test('resets a confirmed MAX phone and its availability when the client phone changes', () => {
  assert.deepEqual(
    resetClientMessengerAvailability(
      { phone: 79991234567, max: '+79991234567', maxPhoneUnavailable: true },
      { phone: 79997654321 }
    ),
    { phone: 79997654321, telegramPhone: null, maxPhoneUnavailable: false, max: '', telegramPhoneUnavailable: false }
  )
})

test('keeps an explicit MAX profile link when the client phone changes', () => {
  const update = resetClientMessengerAvailability(
    { phone: 79991234567, max: 'https://max.ru/u/client' },
    { phone: 79997654321 }
  )
  assert.equal(update.max, undefined)
  assert.equal(update.maxPhoneUnavailable, false)
})

test('keeps an explicitly edited MAX contact when the client phone changes', () => {
  const update = resetClientMessengerAvailability(
    { phone: 79991234567, max: '+79991234567' },
    { phone: 79997654321, max: 'https://max.ru/u/client' }
  )
  assert.equal(update.max, 'https://max.ru/u/client')
})

test('resets an unchanged MAX phone submitted with the full client form', () => {
  const update = resetClientMessengerAvailability(
    { phone: 79991234567, max: '+79991234567' },
    { phone: 79997654321, max: '+79991234567' }
  )
  assert.equal(update.max, '')
})

test('resets availability when Telegram username changes', () => {
  assert.deepEqual(
    resetClientMessengerAvailability(
      { phone: 79991234567, telegram: '', telegramPhoneUnavailable: true },
      { telegram: '@artist_crm' }
    ),
    { telegram: '@artist_crm', telegramPhoneUnavailable: false }
  )
})

test('keeps availability state when contacts are unchanged', () => {
  assert.deepEqual(
    resetClientMessengerAvailability(
      { phone: 79991234567, telegram: 'Artist_CRM' },
      {
        phone: '+7 (999) 123-45-67',
        telegram: '@artist_crm',
        telegramPhoneUnavailable: true,
      }
    ),
    {
      phone: '+7 (999) 123-45-67',
      telegram: '@artist_crm',
      telegramPhoneUnavailable: true,
    }
  )
})

test('allows marking the current phone as unavailable without contact changes', () => {
  assert.deepEqual(
    resetClientMessengerAvailability(
      { phone: 79991234567, telegram: '' },
      { telegramPhoneUnavailable: true }
    ),
    { telegramPhoneUnavailable: true }
  )
})
