import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('contacts Telegram buttons use Telegram app deep links only', async () => {
  const source = await readFile('components/ContactsIconsButtons.js', 'utf8')

  assert.match(source, /tg:\/\/resolve\?domain=\$\{user\.telegram\}/)
  assert.match(source, /tg:\/\/resolve\?phone=\$\{user\.phone\}/)
  assert.match(source, /tg:\/\/resolve\?phone=\$\{user\.telegramPhone\}/)
  assert.doesNotMatch(source, /https:\/\/t\.me/)
})

test('phone messenger fallbacks can be confirmed or hidden everywhere for clients', async () => {
  const [
    source,
    eventCardSource,
    clientSchemaSource,
    modalSource,
    modalButtonsSource,
  ] = await Promise.all([
    readFile('components/ContactsIconsButtons.js', 'utf8'),
    readFile('layouts/cards/EventCard.js', 'utf8'),
    readFile('schemas/clientsSchema.js', 'utf8'),
    readFile('layouts/modals/Modal.js', 'utf8'),
    readFile('layouts/modals/ModalButtons.js', 'utf8'),
  ])

  assert.match(source, /!user\?\.whatsappPhoneUnavailable/)
  assert.match(source, /!user\?\.telegramPhoneUnavailable/)
  assert.match(source, /handlePhoneMessengerAttempt\('whatsapp', user\)/)
  assert.match(source, /handlePhoneMessengerAttempt\('telegram', user\)/)
  assert.match(source, /if \(!showChat \|\| !targetClient\?\._id/)
  assert.doesNotMatch(eventCardSource, /forceTelegram=\{false\}/)
  assert.doesNotMatch(eventCardSource, /handlePhoneMessengerAttempt/)
  assert.match(source, /\[confirmedField\]:\s+provider === 'max' \? maxAction\.phone : targetClient\.phone/)
  assert.match(source, /\[unavailableField\]: true/)
  assert.match(source, /crossActsAsDecline: false/)
  assert.match(source, /neutralButtonName: 'Не знаю'/)
  assert.match(modalSource, /const onCrossClick = crossActsAsDecline/)
  assert.match(modalSource, /confirmPending \? undefined : onCrossClick/)
  assert.match(modalSource, /neutralButtonName\s+\? onCloseButtonClick/)
  assert.match(modalButtonsSource, /onNeutralClick &&/)
  assert.match(modalButtonsSource, /\{neutralName\}/)
  assert.doesNotMatch(source, /\.\.\.targetClient/)
  assert.match(clientSchemaSource, /whatsappPhoneUnavailable:/)
  assert.match(clientSchemaSource, /telegramPhone:/)
  assert.match(clientSchemaSource, /telegramPhoneUnavailable:/)
  assert.match(source, /handlePhoneMessengerAttempt\('max', user\)/)
  assert.match(source, /unconfirmed \? 'bg-red-500' : 'bg-\[#615cff\]'/)
  assert.match(clientSchemaSource, /maxPhoneUnavailable:/)
})
