import test from 'node:test'
import assert from 'node:assert/strict'

import { getUserTariffAccess } from './tariffAccess.js'

test('getUserTariffAccess exposes integration flags from tariff', () => {
  const user = { tariffId: 'paid' }
  const access = getUserTariffAccess(user, [
    {
      _id: 'paid',
      allowAvitoIntegration: true,
      allowVkIntegration: false,
      allowTelegramIntegration: true,
      allowPublicLeadApi: true,
    },
  ])

  assert.equal(access.allowAvitoIntegration, true)
  assert.equal(access.allowVkIntegration, false)
  assert.equal(access.allowTelegramIntegration, true)
  assert.equal(access.allowPublicLeadApi, true)
})

test('getUserTariffAccess keeps Telegram restricted by the selected tariff during trial', () => {
  const user = {
    tariffId: 'free',
    trialEndsAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const access = getUserTariffAccess(user, [
    {
      _id: 'free',
      allowAvitoIntegration: false,
      allowVkIntegration: false,
      allowTelegramIntegration: false,
      allowPublicLeadApi: false,
    },
  ])

  assert.equal(access.allowAvitoIntegration, true)
  assert.equal(access.allowVkIntegration, true)
  assert.equal(access.allowTelegramIntegration, false)
  assert.equal(access.allowPublicLeadApi, false)
})

test('registration offer grants only selected tariff features', () => {
  const endsAt = new Date(Date.now() + 60_000).toISOString()
  const user = {
    tariffId: 'pro',
    trialEndsAt: endsAt,
    registrationOffer: { tariffId: 'pro', endsAt },
  }
  const access = getUserTariffAccess(user, [
    {
      _id: 'pro',
      eventsPerMonth: 50,
      allowDocuments: true,
      allowStatistics: false,
    },
  ])

  assert.equal(access.registrationOfferActive, true)
  assert.equal(access.hasTariff, true)
  assert.equal(access.allowDocuments, true)
  assert.equal(access.allowStatistics, false)
  assert.equal(access.eventsPerMonth, 50)
})

test('expired registration offer no longer grants tariff access', () => {
  const endsAt = new Date(Date.now() - 60_000).toISOString()
  const access = getUserTariffAccess(
    {
      tariffId: 'pro',
      trialEndsAt: endsAt,
      registrationOffer: { tariffId: 'pro', endsAt },
    },
    [{ _id: 'pro', allowDocuments: true, eventsPerMonth: 50 }]
  )

  assert.equal(access.registrationOfferActive, false)
  assert.equal(access.hasTariff, false)
  assert.equal(access.allowDocuments, false)
  assert.equal(access.eventsPerMonth, 0)
})

test('paid renewal replaces an expired registration offer', () => {
  const endsAt = new Date(Date.now() - 60_000).toISOString()
  const access = getUserTariffAccess(
    {
      tariffId: 'pro',
      nextChargeAt: new Date(Date.now() + 60_000).toISOString(),
      registrationOffer: { tariffId: 'pro', endsAt },
    },
    [{ _id: 'pro', allowDocuments: true }]
  )

  assert.equal(access.hasTariff, true)
  assert.equal(access.allowDocuments, true)
})

test('commercial proposals inherit document access for legacy tariffs and allow explicit override', () => {
  const user = { tariffId: 'legacy' }
  const inherited = getUserTariffAccess(user, [
    { _id: 'legacy', allowDocuments: true },
  ])
  const inheritedFromNull = getUserTariffAccess(user, [
    { _id: 'legacy', allowDocuments: true, allowProposals: null },
  ])
  const disabled = getUserTariffAccess(user, [
    { _id: 'legacy', allowDocuments: true, allowProposals: false },
  ])

  assert.equal(inherited.allowProposals, true)
  assert.equal(inheritedFromNull.allowProposals, true)
  assert.equal(disabled.allowProposals, false)
})
