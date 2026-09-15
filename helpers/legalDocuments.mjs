export const LEGAL_DOCUMENTS_EFFECTIVE_DATE = '15.09.2026'
export const TERMS_VERSION = '2026-09-15'
export const PRIVACY_POLICY_VERSION = '2026-09-15'
export const PERSONAL_DATA_CONSENT_VERSION = '2026-09-15'

export const buildLegalAcceptanceFields = (acceptedAt = new Date()) => ({
  consentTermsAccepted: true,
  consentPrivacyPolicyAccepted: true,
  consentPersonalDataAccepted: true,
  termsAcceptedAt: acceptedAt,
  privacyPolicyAcceptedAt: acceptedAt,
  personalDataProcessingAcceptedAt: acceptedAt,
  termsVersion: TERMS_VERSION,
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
})
