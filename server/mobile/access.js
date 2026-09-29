const ACCESS_FLAGS = [
  'trialActive',
  'registrationOfferActive',
  'hasTariff',
  'allowCalendarSync',
  'allowStatistics',
  'allowDocuments',
  'allowProposals',
  'allowClientReviews',
  'allowTelephony',
  'allowAi',
  'allowAvitoIntegration',
  'allowVkIntegration',
  'allowTelegramIntegration',
  'allowPublicLeadApi',
]

export const sanitizeMobileAccess = (access = {}) => ({
  ...Object.fromEntries(
    ACCESS_FLAGS.map((key) => [key, access?.[key] === true])
  ),
  eventsPerMonth: Number.isFinite(Number(access?.eventsPerMonth))
    ? Math.max(0, Number(access.eventsPerMonth))
    : null,
})
