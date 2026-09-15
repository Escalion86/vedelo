import './globals.css'
import './burger.css'
import '../fonts/InterTight.css'
import '../fonts/FuturaPT.css'

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import ClientErrorLogger from '@components/ClientErrorLogger'
import DevelopmentServiceWorkerCleanup from '@components/DevelopmentServiceWorkerCleanup'
import ServiceWorkerRegistration from '@components/ServiceWorkerRegistration'
import AppSnackbarProvider from '@components/AppSnackbarProvider'
import AppQueryProvider from '@components/AppQueryProvider'
import AcquisitionTracker from '@components/AcquisitionTracker'
import AnalyticsConsent from '@components/AnalyticsConsent'
import YandexMetrika from '@components/YandexMetrika'
import { BRAND, getCanonicalBaseUrl } from '@helpers/brand.mjs'

const normalizedSiteUrl = getCanonicalBaseUrl(process.env.DOMAIN)

export const metadata = {
  metadataBase: new URL(normalizedSiteUrl),
  title: 'Ведело — CRM для малого бизнеса',
  description: `${BRAND.description}: заявки, заказы, финансы, документы и напоминания.`,
  applicationName: BRAND.name,
  manifest: '/manifest.json',
  verification: process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION
    ? { yandex: process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION }
    : undefined,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND.name,
  },
  icons: {
    icon: [
      {
        url: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/vedelo-v1/android/android-launchericon-512-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/vedelo-v1/ios/180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

export const viewport = {
  themeColor: '#a56f2a',
}

export default function RootLayout({ children }) {
  const isProduction = process.env.NODE_ENV !== 'development'
  return (
    <html lang="ru" className="scroll-smooth" data-scroll-behavior="smooth">
      <body>
        <AcquisitionTracker />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ClientErrorLogger enabled={isProduction} />
          {!isProduction && <DevelopmentServiceWorkerCleanup />}
          {isProduction && <ServiceWorkerRegistration />}
          {isProduction && <YandexMetrika />}
          <AppQueryProvider>
            <AppSnackbarProvider>{children}</AppSnackbarProvider>
          </AppQueryProvider>
          {isProduction && <AnalyticsConsent />}
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
