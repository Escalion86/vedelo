import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  PERSONAL_DATA_CONSENT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  buildLegalAcceptanceFields,
} from '../helpers/legalDocuments.mjs'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('новое принятие сохраняет три документа, дату и версии', () => {
  const acceptedAt = new Date('2026-09-15T00:00:00.000Z')
  const fields = buildLegalAcceptanceFields(acceptedAt)

  assert.equal(fields.consentTermsAccepted, true)
  assert.equal(fields.consentPrivacyPolicyAccepted, true)
  assert.equal(fields.consentPersonalDataAccepted, true)
  assert.equal(fields.termsAcceptedAt, acceptedAt)
  assert.equal(fields.termsVersion, TERMS_VERSION)
  assert.equal(fields.privacyPolicyVersion, PRIVACY_POLICY_VERSION)
  assert.equal(fields.personalDataConsentVersion, PERSONAL_DATA_CONSENT_VERSION)
})

test('web и mobile показывают отдельные действия для документов', async () => {
  const [webLogin, mobileLogin] = await Promise.all([
    readSource('../app/login/loginInputs.js'),
    readSource('../mobile/app/(auth)/login.tsx'),
  ])

  for (const source of [webLogin, mobileLogin]) {
    assert.match(source, /consentTerms/)
    assert.match(source, /consentPrivacyPolicy/)
    assert.match(source, /consentPersonalData/)
    assert.match(source, /personal-data-consent/)
  }
})

test('публичные документы относятся только к бренду Ведело', async () => {
  const sources = await Promise.all([
    readSource('../app/privacy/page.js'),
    readSource('../app/terms/page.js'),
    readSource('../app/personal-data-consent/page.js'),
    readSource('../app/payment/page.js'),
  ])

  for (const source of sources) {
    assert.match(source, /Ведело/)
    assert.doesNotMatch(source, /ArtistCRM/)
  }
})
