import fs from 'node:fs/promises'
import path from 'node:path'

const files = [
  'app/account-deletion/page.js',
  'app/payment/page.js',
  'app/privacy/page.js',
  'app/terms/page.js',
  'app/proposal/[publicId]/[token]/page.js',
  'app/proposal/[publicId]/[token]/ProposalPublicClient.js',
  'app/opengraph-image.js',
  'app/twitter-image.js',
  'app/robots.js',
  'app/cabinet/[page]/page.js',
  'app/cabinet/page.js',
  'app/api/billing/tochka/create/route.js',
  'app/api/billing/yookassa/create/route.js',
  'app/api/mobile/v1/billing/topup/route.js',
  'app/api/mobile/v1/notifications/test/route.js',
  'components/FileImportSettings.js',
  'components/GoogleCalendarImportSettings.js',
  'components/SeoGuidePage.js',
  'components/SeoLandingPage.js',
  'components/WhatsNewToast.js',
  'helpers/seoGuidePages.js',
  'helpers/seoLandingPages.js',
  'layouts/content/AiUsageAdminContent.js',
  'layouts/content/IntegrationsContent.js',
  'server/aiBilling.js',
  'server/fileImportService.js',
  'server/pushNotifications.js',
  'server/registrationNotificationCore.js',
  'server/telegramBusiness.js',
  'server/tochka.js',
  'server/yookassa.js',
  'mobile/app/(tabs)/profile.tsx',
  'mobile/app/more/[section].tsx',
  'mobile/eas.json',
  'mobile/GITHUB_SECRETS.md',
  'mobile/README.md',
  'mobile/RELEASE_NOTES.md',
  'mobile/scripts/validate-release.mjs',
  'mobile/src/features/integrations/AiUsagePanel.tsx',
  'mobile/src/features/integrations/IntegrationsSection.tsx',
  'mobile/src/features/integrations/ManagedIntegrationsSection.tsx',
  'mobile/src/shared/api/errors.ts',
  'mobile/src/shared/domain/syncQueuePresentation.ts',
  'mobile/src/shared/domain/syncStatePresentation.ts',
  'mobile/src/shared/notifications/useExpoPushNotifications.ts',
]

for (const relativePath of files) {
  const filePath = path.join(process.cwd(), relativePath)
  let source = await fs.readFile(filePath, 'utf8')
  source = source
    .replaceAll('ArtistCRM', 'Ведело')
    .replaceAll('https://artistcrm.ru', 'https://vedelo.ru')
    .replaceAll('support@artistcrm.ru', 'vedelo@inbox.ru')
  await fs.writeFile(filePath, source)
}

console.log(`Обновлена публичная копия в ${files.length} файлах`)
